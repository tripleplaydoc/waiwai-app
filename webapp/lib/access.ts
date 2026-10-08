import "server-only";
import { prisma } from "@/lib/prisma";
import { assertWorkspaceAccess } from "@/lib/workspace";

/**
 * Entity-level authorization for server actions that receive an id from the browser.
 *
 * Each helper loads the entity's workspace and calls assertWorkspaceAccess (which throws when the
 * workspace is not part of the budget the signed-in person may open, e.g. another person's private budget).
 *
 * An id that matches nothing is NOT an error here: the helper returns null and the caller's own
 * "not found" handling runs exactly as before. Existing ids in an inaccessible workspace always throw,
 * so a forged id can never be read, changed or even probed for existence beyond "exists / doesn't".
 */
async function guard(workspaceId: string | null | undefined): Promise<string | null> {
  if (!workspaceId) return null;
  await assertWorkspaceAccess(workspaceId);
  return workspaceId;
}

const str = (id: unknown): string | null => (typeof id === "string" && id.length > 0 ? id : null);

export async function assertAccountAccess(id: unknown): Promise<string | null> {
  const v = str(id);
  return v ? guard((await prisma.account.findUnique({ where: { id: v }, select: { workspaceId: true } }))?.workspaceId) : null;
}
export async function assertCategoryAccess(id: unknown): Promise<string | null> {
  const v = str(id);
  return v ? guard((await prisma.category.findUnique({ where: { id: v }, select: { workspaceId: true } }))?.workspaceId) : null;
}
export async function assertTransactionAccess(id: unknown): Promise<string | null> {
  const v = str(id);
  return v ? guard((await prisma.transaction.findUnique({ where: { id: v }, select: { workspaceId: true } }))?.workspaceId) : null;
}
export async function assertRecurringAccess(id: unknown): Promise<string | null> {
  const v = str(id);
  return v ? guard((await prisma.recurringItem.findUnique({ where: { id: v }, select: { workspaceId: true } }))?.workspaceId) : null;
}
export async function assertCheckpointAccess(id: unknown): Promise<string | null> {
  const v = str(id);
  return v ? guard((await prisma.balanceCheckpoint.findUnique({ where: { id: v }, select: { workspaceId: true } }))?.workspaceId) : null;
}
/** A coin/share position belongs to an account, which belongs to a workspace. */
export async function assertPositionAccess(id: unknown): Promise<string | null> {
  const v = str(id);
  return v ? guard((await prisma.holdingPosition.findUnique({ where: { id: v }, select: { account: { select: { workspaceId: true } } } }))?.account.workspaceId) : null;
}
export async function assertPositionActivityAccess(id: unknown): Promise<string | null> {
  const v = str(id);
  return v ? guard((await prisma.positionActivity.findUnique({ where: { id: v }, select: { position: { select: { account: { select: { workspaceId: true } } } } } }))?.position.account.workspaceId) : null;
}
/** Plain workspace id from the browser (thin alias so call sites read the same as the others). */
export async function assertWorkspaceIdAccess(id: unknown): Promise<string | null> {
  const v = str(id);
  if (!v) return null;
  await assertWorkspaceAccess(v);
  return v;
}
