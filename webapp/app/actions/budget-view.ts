"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { assertAuthed } from "@/lib/auth";
import { parseHorizon, parseMode } from "@/lib/budget/horizon";
import type { ActionResult } from "./types";

const opts = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" };

/** Remember how the pocket screen is shown: Simple or Advanced, and this month or one month ahead. */
export async function setBudgetViewAction(view: { mode?: string; horizon?: string }): Promise<ActionResult> {
  await assertAuthed();
  const jar = await cookies();
  if (view.mode !== undefined) jar.set("ww_budget_mode", parseMode(view.mode), opts);
  if (view.horizon !== undefined) jar.set("ww_budget_horizon", parseHorizon(view.horizon), opts);
  revalidatePath("/budget");
  return { ok: true };
}
