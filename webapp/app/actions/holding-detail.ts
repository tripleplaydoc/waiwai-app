"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertAuthed } from "@/lib/auth";
import { parseToCents } from "@/lib/utils/currency";
import { isoToDate, todayIso } from "@/lib/utils/dates";
import { holdingOf, holdingSide } from "@/lib/holdings";
import { cleanDecimal } from "@/lib/prices/math";
import { lookupPrices } from "@/lib/prices/providers";
import { refreshPrices, snapshotAccountValue } from "@/lib/prices/refresh";
import type { ActionResult } from "./types";

const done = (id?: string) => {
  if (id) revalidatePath(`/holdings/${id}`);
  revalidatePath("/holdings");
  revalidatePath("/accounts", "layout");
  revalidatePath("/reports");
};

const blank = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const dollars = (v: FormDataEntryValue | null, label: string): { cents: number | null } | { error: string } => {
  const t = blank(v);
  if (t === null) return { cents: null };
  const c = parseToCents(t);
  return c === null || c < 0 ? { error: `${label} must be an amount like 450.00.` } : { cents: c };
};
const wholeNumber = (v: FormDataEntryValue | null, label: string, max: number): { n: number | null } | { error: string } => {
  const t = blank(v);
  if (t === null) return { n: null };
  const n = Number(t.replace(/,/g, ""));
  return Number.isInteger(n) && n >= 0 && n <= max ? { n } : { error: `${label} must be a whole number.` };
};
const dateOrNull = (v: FormDataEntryValue | null): Date | null | "bad" => {
  const t = blank(v);
  if (t === null) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? isoToDate(t) : "bad";
};

async function manualAccount(id: unknown) {
  const parsed = z.string().min(1).safeParse(id);
  if (!parsed.success) return null;
  const a = await prisma.account.findUnique({ where: { id: parsed.data } });
  return a && !a.isArchived && a.balanceMode === "MANUAL" ? a : null;
}

// ------------------------------------------------------------------ prices
/** Pulls fresh prices. `maxAgeMinutes` > 0 skips anything refreshed recently (used by the automatic refresh). */
export async function refreshPricesAction(workspaceId: string | undefined, maxAgeMinutes = 0): Promise<ActionResult> {
  await assertAuthed();
  const s = await refreshPrices({ workspaceIds: workspaceId ? [workspaceId] : undefined, maxAgeMs: maxAgeMinutes > 0 ? maxAgeMinutes * 60_000 : undefined });
  if (s.updated > 0 || s.failed.length > 0) done();
  if (s.updated === 0 && s.failed.length === 0) return { ok: true, message: "Prices are up to date." };
  const missed = s.failed.join(", ");
  if (s.updated === 0) return { ok: false, error: `Couldn't get a price for ${missed} right now. Your last known values are kept.` };
  return { ok: true, message: s.failed.length ? `Updated ${s.updated}. Couldn't get a price for ${missed}.` : `Updated ${s.updated} price${s.updated === 1 ? "" : "s"}.` };
}

const symbolSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9.\-]{0,14}$/, "Enter a ticker or coin symbol like AAPL or BTC.");

/** Adds or edits a position (coins or shares) on a crypto / stocks holding, then prices it right away. */
export async function savePositionAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const acct = await manualAccount(formData.get("accountId"));
  if (!acct) return { ok: false, error: "Not found." };
  const cls = holdingOf(acct);
  if (cls !== "CRYPTO" && cls !== "STOCKS_FUNDS") return { ok: false, error: "Coins and shares can only be added to a Crypto or Stocks holding." };
  const kind = cls === "CRYPTO" ? "CRYPTO" : "STOCK";
  const sym = symbolSchema.safeParse(formData.get("symbol"));
  if (!sym.success) return { ok: false, error: sym.error.issues[0]?.message ?? "Check the symbol." };
  const qty = cleanDecimal(String(formData.get("quantity") ?? ""));
  if (qty === null || Number(qty) <= 0) return { ok: false, error: kind === "CRYPTO" ? "Enter how many coins you hold, like 0.5." : "Enter how many shares you hold, like 10 or 2.5." };
  const cost = dollars(formData.get("cost"), "What you paid");
  if ("error" in cost) return { ok: false, error: cost.error };
  const positionId = blank(formData.get("positionId"));

  const clash = await prisma.holdingPosition.findFirst({ where: { accountId: acct.id, kind, symbol: sym.data, ...(positionId ? { NOT: { id: positionId } } : {}) } });
  if (clash) return { ok: false, error: `${sym.data} is already in here. Edit it instead.` };

  const data = { kind, symbol: sym.data, quantity: qty, costBasisCents: cost.cents } as const;
  let id: string;
  if (positionId) {
    const own = await prisma.holdingPosition.findFirst({ where: { id: positionId, accountId: acct.id } });
    if (!own) return { ok: false, error: "Not found." };
    await prisma.holdingPosition.update({ where: { id: own.id }, data });
    id = own.id;
  } else {
    id = (await prisma.holdingPosition.create({ data: { accountId: acct.id, ...data } })).id;
  }
  // Price it now so the value is right straight away.
  const hit = (await lookupPrices([{ kind, symbol: sym.data }])).get(`${kind}:${sym.data}`);
  if (hit) await prisma.holdingPosition.update({ where: { id }, data: { lastPrice: hit.price, priceAt: new Date(), priceSource: hit.source, ...(hit.name ? { name: hit.name } : {}) } });
  await snapshotAccountValue(acct.id);
  done(acct.id);
  return hit ? { ok: true, message: `${sym.data} saved at the current price.` } : { ok: true, message: `${sym.data} saved, but no price was found yet. Check the symbol — it will price itself when one is found.` };
}

export async function removePositionAction(positionId: string): Promise<ActionResult> {
  await assertAuthed();
  const p = await prisma.holdingPosition.findUnique({ where: { id: positionId } });
  if (!p) return { ok: false, error: "Not found." };
  await prisma.holdingPosition.delete({ where: { id: p.id } });
  const remaining = await prisma.holdingPosition.count({ where: { accountId: p.accountId } });
  if (remaining > 0) await snapshotAccountValue(p.accountId);
  done(p.accountId);
  return { ok: true };
}

/** Uninvested cash held next to the coins/shares; included in the account's value. */
export async function saveCashAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const acct = await manualAccount(formData.get("accountId"));
  if (!acct) return { ok: false, error: "Not found." };
  const cash = dollars(formData.get("cash"), "Cash");
  if ("error" in cash) return { ok: false, error: cash.error };
  await prisma.holdingDetail.upsert({ where: { accountId: acct.id }, create: { accountId: acct.id, cashCents: cash.cents ?? 0 }, update: { cashCents: cash.cents ?? 0 } });
  await snapshotAccountValue(acct.id);
  done(acct.id);
  return { ok: true, message: "Saved." };
}

// ------------------------------------------------------------------ values
/** Records a new hand-entered value (vehicle from KBB, loan balance from a statement…) as of a date. */
export async function setHoldingValueAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const acct = await manualAccount(formData.get("accountId"));
  if (!acct) return { ok: false, error: "Not found." };
  const v = dollars(formData.get("value"), "Value");
  if ("error" in v) return { ok: false, error: v.error };
  if (v.cents === null) return { ok: false, error: "Enter an amount." };
  const when = dateOrNull(formData.get("asOf")) ?? isoToDate(todayIso());
  if (when === "bad") return { ok: false, error: "Pick a date." };
  const signed = holdingSide(holdingOf(acct)) === "ASSET" ? v.cents : -v.cents;
  const note = blank(formData.get("note"));
  await prisma.$transaction([
    prisma.manualBalanceEntry.deleteMany({ where: { accountId: acct.id, asOfDate: when } }),
    prisma.manualBalanceEntry.create({ data: { accountId: acct.id, asOfDate: when, balanceCents: signed, note } }),
  ]);
  done(acct.id);
  return { ok: true, message: "Value updated." };
}

// ------------------------------------------------------------------ details
const RATE = /^\d{1,3}(\.\d{1,2})?$/;

export async function saveLoanTermsAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const acct = await manualAccount(formData.get("accountId"));
  if (!acct) return { ok: false, error: "Not found." };
  const rateText = blank(formData.get("rate"))?.replace(/%/g, "").trim() ?? null;
  if (rateText !== null && (!RATE.test(rateText) || Number(rateText) > 100)) return { ok: false, error: "Interest rate should look like 6.25 (a yearly percentage)." };
  const pay = dollars(formData.get("payment"), "Monthly payment");
  const orig = dollars(formData.get("original"), "Original loan amount");
  if ("error" in pay) return { ok: false, error: pay.error };
  if ("error" in orig) return { ok: false, error: orig.error };
  const term = wholeNumber(formData.get("termMonths"), "Loan length (months)", 1200);
  if ("error" in term) return { ok: false, error: term.error };
  if (term.n === 0) return { ok: false, error: "Loan length must be at least 1 month." };
  const start = dateOrNull(formData.get("startDate"));
  if (start === "bad") return { ok: false, error: "Pick a valid start date." };
  const fields = { interestRateBps: rateText === null ? null : Math.round(Number(rateText) * 100), termMonths: term.n, originalAmountCents: orig.cents, loanStartDate: start };
  await prisma.$transaction([
    prisma.holdingDetail.upsert({ where: { accountId: acct.id }, create: { accountId: acct.id, ...fields }, update: fields }),
    prisma.account.update({ where: { id: acct.id }, data: { monthlyCashflowCents: pay.cents } }),
  ]);
  done(acct.id);
  return { ok: true, message: "Loan details saved." };
}

export async function saveVehicleAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const acct = await manualAccount(formData.get("accountId"));
  if (!acct) return { ok: false, error: "Not found." };
  const vin = blank(formData.get("vin"))?.toUpperCase() ?? null;
  if (vin !== null && !/^[A-HJ-NPR-Z0-9]{11,17}$/.test(vin)) return { ok: false, error: "A VIN is 17 letters and numbers (no I, O or Q)." };
  const year = wholeNumber(formData.get("year"), "Year", 2100);
  const miles = wholeNumber(formData.get("mileage"), "Mileage", 2_000_000);
  if ("error" in year) return { ok: false, error: year.error };
  if ("error" in miles) return { ok: false, error: miles.error };
  if (year.n !== null && year.n < 1900) return { ok: false, error: "Year looks off." };
  const fields = { vin, vehicleYear: year.n, vehicleMake: blank(formData.get("make")), vehicleModel: blank(formData.get("model")), vehicleTrim: blank(formData.get("trim")), mileage: miles.n };
  await prisma.holdingDetail.upsert({ where: { accountId: acct.id }, create: { accountId: acct.id, ...fields }, update: fields });
  done(acct.id);
  return { ok: true, message: "Vehicle saved." };
}

/** Cost basis, purchase date, notes, and the loan this asset secures (for equity). */
export async function saveAssetInfoAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await assertAuthed();
  const acct = await manualAccount(formData.get("accountId"));
  if (!acct) return { ok: false, error: "Not found." };
  const basis = dollars(formData.get("cost"), "What you paid");
  if ("error" in basis) return { ok: false, error: basis.error };
  const bought = dateOrNull(formData.get("purchaseDate"));
  if (bought === "bad") return { ok: false, error: "Pick a valid date." };
  const notes = blank(formData.get("notes"));
  if (notes && notes.length > 2000) return { ok: false, error: "Notes are limited to 2,000 characters." };
  const loanId = blank(formData.get("linkedLoanId"));
  if (loanId) {
    const loan = await prisma.account.findUnique({ where: { id: loanId } });
    if (!loan || loan.workspaceId !== acct.workspaceId || holdingSide(holdingOf(loan)) !== "LIABILITY") return { ok: false, error: "Pick one of your loans." };
  }
  const fields = { costBasisCents: basis.cents, purchaseDate: bought, notes, linkedLoanId: loanId };
  await prisma.holdingDetail.upsert({ where: { accountId: acct.id }, create: { accountId: acct.id, ...fields }, update: fields });
  done(acct.id);
  return { ok: true, message: "Saved." };
}

// ------------------------------------------------------------------ VIN
export type VinResult = { ok: true; vehicle: { year: string; make: string; model: string; trim: string } } | { ok: false; error: string };

/** Looks a VIN up in the US government's free NHTSA database (year, make, model, trim). */
export async function decodeVinAction(vinText: string): Promise<VinResult> {
  await assertAuthed();
  const vin = vinText.trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return { ok: false, error: "Enter the full 17-character VIN." };
  try {
    const base = process.env.NHTSA_BASE || "https://vpic.nhtsa.dot.gov";
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(`${base}/api/vehicles/DecodeVinValues/${vin}?format=json`, { signal: ctl.signal, cache: "no-store" }).finally(() => clearTimeout(t));
    if (!r.ok) return { ok: false, error: "The VIN lookup service didn't answer. Try again in a minute." };
    const row = (await r.json())?.Results?.[0];
    if (!row || !row.Make) return { ok: false, error: "That VIN wasn't recognized. Double-check it." };
    const title = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    return { ok: true, vehicle: { year: row.ModelYear || "", make: title(row.Make), model: row.Model || "", trim: row.Trim || row.Series || "" } };
  } catch {
    return { ok: false, error: "Couldn't reach the VIN lookup. You can type the details in instead." };
  }
}
