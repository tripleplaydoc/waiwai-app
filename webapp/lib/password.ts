import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

const KEYLEN = 64;
const N = 16384;

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, KEYLEN, { N, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** Stored format: scrypt$<salt hex>$<hash hex>. Only the hash is ever saved. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export function isRealHash(stored: string): boolean {
  return stored.startsWith("scrypt$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!isRealHash(stored)) return false;
  const [, saltHex, hashHex] = stored.split("$");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export const MIN_PASSWORD = 10;

export function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  return null;
}
