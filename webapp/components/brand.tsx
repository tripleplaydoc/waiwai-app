import { Wallet } from "lucide-react";

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-sm shadow-indigo-500/30 ${className}`}
      aria-hidden
    >
      <Wallet className="size-[18px]" />
    </span>
  );
}

export function BrandName() {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark />
      <span className="text-[15px] font-semibold tracking-tight">Financial Tracker</span>
    </span>
  );
}
