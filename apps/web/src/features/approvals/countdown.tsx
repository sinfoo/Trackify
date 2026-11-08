"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

function left(ms: number) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Live "expires in" countdown, mono. Warning tone by default (prototype), --danger under 10 minutes (README). */
export function Countdown({ to, prefix, className }: { to: string | null | undefined; prefix?: string; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!to) return <span className="text-t3">No expiry</span>;
  const ms = new Date(to).getTime() - now;
  const soon = ms < 600_000;
  return (
    <span title={formatDateTime(to)} suppressHydrationWarning className={cn("num text-xs font-semibold whitespace-nowrap", soon ? "text-danger" : "text-warning", className)}>
      {ms <= 0 ? "Expired" : `${prefix ?? ""}${left(ms)}`}
    </span>
  );
}
