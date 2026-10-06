"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertAuthed } from "@/lib/auth";
import { SUGGESTED_TAGS, cleanTagName, normalizeColor } from "@/lib/budget/tags";
import { replacePocketTags } from "@/lib/budget/tags-state";
import type { ActionResult } from "./types";

const done = () => revalidatePath("/budget");
const NEEDS_TABLE = "Tags need their new database table first. Run the pocket_tags SQL in Supabase, then try again.";

export async function createTagAction(workspaceId: string, name: string, color: string): Promise<ActionResult> {
  await assertAuthed();
  const n = cleanTagName(name), c = normalizeColor(color);
  if (!n) return { ok: false, error: "Give the tag a short name (up to 24 characters)." };
  if (!c) return { ok: false, error: "Pick a colour." };
  try {
    if (await prisma.pocketTag.findFirst({ where: { workspaceId, name: { equals: n, mode: "insensitive" } } })) return { ok: false, error: "You already have a tag with that name." };
    const top = await prisma.pocketTag.aggregate({ where: { workspaceId }, _max: { sortOrder: true } });
    await prisma.pocketTag.create({ data: { workspaceId, name: n, color: c, sortOrder: (top._max.sortOrder ?? -1) + 1 } });
  } catch { return { ok: false, error: NEEDS_TABLE }; }
  done();
  return { ok: true };
}

export async function updateTagAction(workspaceId: string, id: string, name: string, color: string): Promise<ActionResult> {
  await assertAuthed();
  const n = cleanTagName(name), c = normalizeColor(color);
  if (!n) return { ok: false, error: "Give the tag a short name (up to 24 characters)." };
  if (!c) return { ok: false, error: "Pick a colour." };
  try {
    const tag = await prisma.pocketTag.findFirst({ where: { id, workspaceId } });
    if (!tag) return { ok: false, error: "Tag not found." };
    const clash = await prisma.pocketTag.findFirst({ where: { workspaceId, id: { not: id }, name: { equals: n, mode: "insensitive" } } });
    if (clash) return { ok: false, error: "You already have a tag with that name." };
    await prisma.pocketTag.update({ where: { id }, data: { name: n, color: c } });
  } catch { return { ok: false, error: "Could not save that tag." }; }
  done();
  return { ok: true };
}

/** Deleting a tag only removes the label from pockets; nothing else changes. */
export async function deleteTagAction(workspaceId: string, id: string): Promise<ActionResult> {
  await assertAuthed();
  try { await prisma.pocketTag.deleteMany({ where: { id, workspaceId } }); } catch { return { ok: false, error: "Could not delete that tag." }; }
  done();
  return { ok: true };
}

/** One tap to add Fixed, Variable, Loan and Payroll (skips any you already have). */
export async function addSuggestedTagsAction(workspaceId: string): Promise<ActionResult> {
  await assertAuthed();
  try {
    const have = new Set((await prisma.pocketTag.findMany({ where: { workspaceId }, select: { name: true } })).map((t) => t.name.toLowerCase()));
    const top = await prisma.pocketTag.aggregate({ where: { workspaceId }, _max: { sortOrder: true } });
    let order = (top._max.sortOrder ?? -1) + 1;
    const add = SUGGESTED_TAGS.filter((t) => !have.has(t.name.toLowerCase())).map((t) => ({ workspaceId, name: t.name, color: t.color, sortOrder: order++ }));
    if (add.length) await prisma.pocketTag.createMany({ data: add });
  } catch { return { ok: false, error: NEEDS_TABLE }; }
  done();
  return { ok: true };
}

export async function setPocketTagsAction(workspaceId: string, categoryId: string, tagIds: string[]): Promise<ActionResult> {
  await assertAuthed();
  try { await replacePocketTags(workspaceId, categoryId, tagIds); } catch { return { ok: false, error: "Could not save the tags." }; }
  done();
  return { ok: true };
}
