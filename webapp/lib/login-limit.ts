import "server-only";
import { prisma } from "@/lib/prisma";

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

/** Minutes left on a lockout for this key, or 0 when sign-in is allowed. */
export async function lockoutMinutes(key: string): Promise<number> {
  const row = await prisma.loginAttempt.findUnique({ where: { key } });
  if (!row?.lockedUntil) return 0;
  const ms = row.lockedUntil.getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 60000) : 0;
}

export async function recordFailure(key: string): Promise<void> {
  const row = await prisma.loginAttempt.findUnique({ where: { key } });
  const expired = row?.lockedUntil && row.lockedUntil.getTime() <= Date.now();
  const failures = (expired ? 0 : row?.failures ?? 0) + 1;
  const lockedUntil = failures >= MAX_FAILURES ? new Date(Date.now() + LOCK_MINUTES * 60000) : null;
  await prisma.loginAttempt.upsert({
    where: { key },
    create: { key, failures: lockedUntil ? 0 : failures, lockedUntil },
    update: { failures: lockedUntil ? 0 : failures, lockedUntil },
  });
}

export async function clearFailures(key: string): Promise<void> {
  await prisma.loginAttempt.deleteMany({ where: { key } });
}
