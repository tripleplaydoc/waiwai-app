"use client";

import { useState } from "react";
import { Download } from "lucide-react";

export function ExportForm({ accounts, wsKey, from, to }: { accounts: { id: string; name: string }[]; wsKey: string; from: string; to: string }) {
  const [kind, setKind] = useState("qbo");
  const [account, setAccount] = useState(accounts[0]?.id ?? "");
  const needsAccount = kind === "qbo";
  const noAccounts = needsAccount && accounts.length === 0;
  return (
    <form method="get" action="/reports/export" className="mt-4 grid gap-3 sm:grid-cols-[1.4fr_1fr_auto] sm:items-end">
      {wsKey === "business" && <input type="hidden" name="ws" value="business" />}
      <input type="hidden" name="period" value="custom" />
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      <div>
        <label htmlFor="ex-kind" className="label">What to export</label>
        <select id="ex-kind" name="kind" className="input" value={kind} onChange={(e) => { setKind(e.target.value); if (e.target.value === "qbo" && !account) setAccount(accounts[0]?.id ?? ""); }}>
          <option value="qbo">QuickBooks Online: bank transactions (one account)</option>
          <option value="transactions">All transactions with pocket, type &amp; Schedule C line</option>
          <option value="schedulec">Schedule C summary by IRS line</option>
          <option value="pnl">Profit &amp; loss by type</option>
        </select>
      </div>
      <div>
        <label htmlFor="ex-acct" className="label">Account</label>
        <select id="ex-acct" name="account" className="input" value={account} onChange={(e) => setAccount(e.target.value)} disabled={kind === "schedulec" || kind === "pnl"}>
          {!needsAccount && <option value="">All accounts</option>}
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <button type="submit" className="btn btn-primary" disabled={noAccounts}><Download className="size-4" aria-hidden /> Download</button>
    </form>
  );
}
