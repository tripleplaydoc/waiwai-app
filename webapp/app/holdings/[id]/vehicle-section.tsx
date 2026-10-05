"use client";

import { useActionState, useState, useTransition } from "react";
import { ExternalLink, Search } from "lucide-react";
import { decodeVinAction, saveVehicleAction, setHoldingValueAction } from "@/app/actions/holding-detail";
import { formatCents } from "@/lib/utils/currency";
import type { MetaVM } from "@/lib/reports/holding-meta";
import { Msg, Section } from "./ui";

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function kbbUrl(m: Pick<MetaVM, "year" | "make" | "model">) {
  return m.make && m.model && m.year ? `https://www.kbb.com/${slug(m.make)}/${slug(m.model)}/${m.year}/` : "https://www.kbb.com/whats-my-car-worth/";
}

export function VehicleSection({ accountId, meta, valueCents, today, daysSinceValued }: { accountId: string; meta: MetaVM; valueCents: number; today: string; daysSinceValued: number | null }) {
  const [saved, saveAction, saving] = useActionState(saveVehicleAction, undefined);
  const [valState, valAction, valPending] = useActionState(setHoldingValueAction, undefined);
  const [v, setV] = useState({ vin: meta.vin ?? "", year: meta.year ? String(meta.year) : "", make: meta.make ?? "", model: meta.model ?? "", trim: meta.trim ?? "", mileage: meta.mileage != null ? String(meta.mileage) : "" });
  const [lookup, setLookup] = useState<{ ok: boolean; text: string }>();
  const [looking, startLook] = useTransition();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  const stale = daysSinceValued === null || daysSinceValued > 90;
  const name = [v.year, v.make, v.model].filter(Boolean).join(" ");
  return (
    <>
      <Section title="Value" hint="Kelley Blue Book doesn't offer a free automatic price feed, so the quickest way is to look your car up there, then enter the number here. WaiWai keeps every value you save, so the reports show how it changes over time.">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <a className="btn btn-sm" href={kbbUrl({ year: v.year ? Number(v.year) : null, make: v.make || null, model: v.model || null })} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" aria-hidden /> Look up {name || "my car"} on KBB</a>
          {stale && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">{daysSinceValued === null ? "Never checked" : `Last checked ${daysSinceValued} days ago`}: time for a fresh value</span>}
        </div>
        <form action={valAction} className="grid grid-cols-2 gap-3">
          <input type="hidden" name="accountId" value={accountId} />
          <input type="hidden" name="note" value="Kelley Blue Book" />
          <div>
            <label htmlFor="veh-val" className="label">New value (now {formatCents(valueCents)})</label>
            <input id="veh-val" name="value" required inputMode="decimal" className="input nums" placeholder="0.00" />
          </div>
          <div>
            <label htmlFor="veh-asof" className="label">As of</label>
            <input id="veh-asof" name="asOf" type="date" defaultValue={today} className="input" />
          </div>
          <div className="col-span-2 flex items-center gap-3"><button type="submit" className="btn btn-primary" disabled={valPending}>{valPending ? "Saving…" : "Save value"}</button><Msg state={valState} /></div>
        </form>
      </Section>
      <Section title="Vehicle details">
        <form action={saveAction} className="space-y-3">
          <input type="hidden" name="accountId" value={accountId} />
          <div>
            <label htmlFor="veh-vin" className="label">VIN <span className="font-normal text-slate-500">(optional: fills in the rest)</span></label>
            <div className="flex gap-2">
              <input id="veh-vin" name="vin" value={v.vin} onChange={set("vin")} maxLength={17} autoCapitalize="characters" autoComplete="off" className="input uppercase" placeholder="17 characters" />
              <button type="button" className="btn shrink-0" disabled={looking || v.vin.trim().length < 17} aria-label="Look up VIN"
                onClick={() => startLook(async () => { const r = await decodeVinAction(v.vin); if (r.ok) { setV((p) => ({ ...p, year: r.vehicle.year, make: r.vehicle.make, model: r.vehicle.model, trim: r.vehicle.trim })); setLookup({ ok: true, text: "Found it. Check the details, then Save." }); } else setLookup({ ok: false, text: r.error }); })}>
                <Search className="size-4" aria-hidden /> {looking ? "…" : "Look up"}
              </button>
            </div>
            {lookup && <p role={lookup.ok ? "status" : "alert"} className={`mt-1 text-xs ${lookup.ok ? "text-pos" : "text-[#C9372C]"}`}>{lookup.text}</p>}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label htmlFor="veh-year" className="label">Year</label><input id="veh-year" name="year" value={v.year} onChange={set("year")} inputMode="numeric" maxLength={4} className="input nums" placeholder="2019" /></div>
            <div className="col-span-2"><label htmlFor="veh-make" className="label">Make</label><input id="veh-make" name="make" value={v.make} onChange={set("make")} maxLength={40} className="input" placeholder="Toyota" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="veh-model" className="label">Model</label><input id="veh-model" name="model" value={v.model} onChange={set("model")} maxLength={40} className="input" placeholder="Camry" /></div>
            <div><label htmlFor="veh-trim" className="label">Trim</label><input id="veh-trim" name="trim" value={v.trim} onChange={set("trim")} maxLength={40} className="input" placeholder="SE" /></div>
          </div>
          <div>
            <label htmlFor="veh-miles" className="label">Mileage</label>
            <input id="veh-miles" name="mileage" value={v.mileage} onChange={set("mileage")} inputMode="numeric" className="input nums" placeholder="42000" />
          </div>
          <div className="flex items-center gap-3"><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save details"}</button><Msg state={saved} /></div>
        </form>
      </Section>
    </>
  );
}
