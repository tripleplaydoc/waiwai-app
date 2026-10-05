import "server-only";
import { prisma } from "@/lib/prisma";
import { loanStatus } from "@/lib/loans";
import { dateToIso } from "@/lib/utils/dates";
import type { EnvelopeRow } from "./summary";
import { holdingOf, holdingSide } from "@/lib/holdings";
import type { AssetChoice, LoanVM } from "./loans-types";

/**
 * Every loan account in the workspace with where it stands this month. Loans that have terms and a budget pocket also keep
 * that pocket in step with the schedule: no target before the first payment, archived after the last.
 */
/** Hand-valued assets in the workspace that a loan can be secured by (car, home, boat…). */
export async function loadAssetChoices(workspaceId: string): Promise<AssetChoice[]> {
  const accts = await prisma.account.findMany({ where: { workspaceId, isArchived: false, balanceMode: "MANUAL" }, include: { holdingDetail: { include: { linkedLoan: { select: { name: true } } } } }, orderBy: { name: "asc" } });
  return accts.filter((a) => holdingSide(holdingOf(a)) === "ASSET").map((a) => ({ id: a.id, name: a.name, otherLoan: a.holdingDetail?.linkedLoan?.name ?? null }));
}

export async function loadLoans(workspaceId: string, monthIso: string, rows: EnvelopeRow[], syncPockets: boolean): Promise<LoanVM[]> {
  const accounts = await prisma.account.findMany({
    where: { workspaceId, type: "LOAN", isArchived: false },
    include: { holdingDetail: true, loanPocket: true, manualBalanceEntries: { orderBy: { asOfDate: "desc" }, take: 1 } },
    orderBy: { name: "asc" },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const secured = await prisma.holdingDetail.findMany({
    where: { linkedLoanId: { in: accounts.map((a) => a.id) } },
    include: { account: { include: { manualBalanceEntries: { orderBy: { asOfDate: "desc" }, take: 1 } } } },
  });
  const securedBy = new Map(secured.filter((h) => !h.account.isArchived).map((h) => [h.linkedLoanId!, { id: h.account.id, name: h.account.name, valueCents: Math.max(0, h.account.manualBalanceEntries[0]?.balanceCents ?? 0) }]));
  const out: LoanVM[] = [];
  for (const a of accounts) {
    const d = a.holdingDetail;
    const pocket = a.loanPocket && !a.loanPocket.isArchived ? a.loanPocket : null;
    const pay = a.monthlyCashflowCents ?? 0;
    const first = d?.firstPaymentDate ? dateToIso(d.firstPaymentDate) : null;
    const n = d?.termMonths ?? null;
    const owed = Math.max(0, -(a.manualBalanceEntries[0]?.balanceCents ?? 0));
    const base = { accountId: a.id, name: a.name, paymentCents: pay, numPayments: n, firstDueIso: first, aprBps: d?.interestRateBps ?? 0, originalCents: d?.originalAmountCents ?? 0, groupId: pocket?.categoryGroupId ?? null, paidFromId: pocket?.paidFromAccountId ?? null, balanceOwedCents: owed, securedBy: securedBy.get(a.id) ?? null };
    if (!first || !n || pay <= 0) {
      out.push({ ...base, onBudget: false, paymentsDone: 0, paymentsLeft: n ?? 0, nextDueIso: null, lastDueIso: null, phase: "unset", remainingCents: 0, paidThisMonth: false, overdue: false });
      continue;
    }
    const row = pocket ? byId.get(pocket.id) : undefined;
    const spent = row ? Math.max(0, -row.activityCents) : 0;
    const paid = !!row && (row.manualPaid || (spent > 0 && spent >= pay));
    const st = loanStatus({ paymentCents: pay, numPayments: n, firstDueIso: first, aprBps: base.aprBps, originalCents: base.originalCents }, `${monthIso}-01`, paid);
    const dueThis = st.thisMonthNumber !== null;
    const overdue = !paid && dueThis && st.nextDueIso !== null && st.nextDueIso < dateToIso(new Date()) && st.nextDueIso.startsWith(monthIso);
    out.push({ ...base, onBudget: !!pocket, paymentsDone: st.paymentsDone, paymentsLeft: st.paymentsLeft, nextDueIso: st.nextDueIso, lastDueIso: st.lastDueIso, phase: st.phase, remainingCents: st.remainingCents, paidThisMonth: paid, overdue });

    if (syncPockets && a.loanPocket) {
      const p = a.loanPocket;
      if (st.phase === "finished" && !p.isArchived) await prisma.category.update({ where: { id: p.id }, data: { isArchived: true } });
      else if (st.phase !== "finished" && !p.isArchived) {
        const want = st.phase === "upcoming" ? 0 : pay;
        const wantDue = st.phase === "upcoming" ? null : +first.slice(8, 10); // no due date (so no bill) before the first payment's month
        if (p.fundingTargetCents !== want || p.dueDay !== wantDue) await prisma.category.update({ where: { id: p.id }, data: { fundingTargetType: "MONTHLY_FUNDING", fundingTargetCents: want, dueDay: wantDue } });
      }
    }
  }
  return out;
}
