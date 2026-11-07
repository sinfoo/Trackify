"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

function left(ms: number) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

/** Live "expires in" countdown. Under 1h it turns warning tone, with the word "Expires" kept for non-color cue. */
export function Countdown({ to, className }: { to: string | null | undefined; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!to) return <span className="text-muted-foreground">No expiry</span>;
  const ms = new Date(to).getTime() - now;
  const soon = ms < 3_600_000;
  return (
    <span
      title={formatDateTime(to)}
      suppressHydrationWarning
      className={cn("num inline-flex items-center gap-1 whitespace-nowrap text-sm", soon && "font-medium text-warning-text", className)}
    >
      <Clock aria-hidden className="size-3.5" />
      {ms <= 0 ? "Expired" : `Expires in ${left(ms)}`}
    </span>
  );
}
