"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertAuthed, getCurrentUser } from "@/lib/auth";
import { normalizeLayout } from "@/lib/home-layout";
import type { ActionResult } from "./types";

/** Save which Home sections show and in what order, for this person. */
export async function saveHomeLayoutAction(order: string[], hidden: string[]): Promise<ActionResult> {
  await assertAuthed();
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Not signed in." };
  const layout = JSON.stringify(normalizeLayout(order, hidden));
  try {
    await prisma.homeLayout.upsert({ where: { userId: me.id }, update: { layout }, create: { userId: me.id, layout } });
  } catch {
    return { ok: false, error: "Could not save just now. Try again in a moment." };
  }
  revalidatePath("/home");
  return { ok: true };
}

/** Back to the standard order with everything showing. */
export async function resetHomeLayoutAction(): Promise<ActionResult> {
  await assertAuthed();
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Not signed in." };
  try { await prisma.homeLayout.deleteMany({ where: { userId: me.id } }); } catch { return { ok: false, error: "Could not reset just now." }; }
  revalidatePath("/home");
  return { ok: true };
}
