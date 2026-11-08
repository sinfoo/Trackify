"use client";

import { useQuery } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, StatusBadge, TimeAgo } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { AppSettings } from "@/lib/types";

type Payments = {
  provider?: string;
  live_mode?: boolean;
  currency?: string;
  high_value_threshold?: string;
  velocity_max_attempts?: number;
  velocity_window_minutes?: number;
  failed_attempts_threshold?: number;
  test_methods?: { id: string; label: string }[];
};

/** Read-only toggle in the prototype's 40×24 style (the values come from server config). */
function Toggle({ on, label }: { on: boolean; label: string }) {
  return (
    <span role="switch" aria-checked={on} aria-label={label} aria-readonly className="relative inline-block h-6 w-10 shrink-0 rounded-xl" style={{ background: on ? "var(--brand)" : "var(--hair2)" }}>
      <span className="absolute top-[3px] size-[18px] rounded-full bg-white transition-[left] duration-200" style={{ left: on ? 19 : 3 }} />
    </span>
  );
}

function Row({ label, desc, value, on }: { label: string; desc: string; value?: string; on?: boolean }) {
  return (
    <li className="flex items-center gap-3.5 border-t border-hair px-5 py-3.5">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{label}</span>
        <span className="mt-0.5 block text-[12.5px] text-t3">{desc}</span>
      </span>
      {value !== undefined && <span className="num inline-flex h-[34px] items-center rounded-[10px] border border-hair2 bg-input px-3 text-[13px] font-semibold">{value}</span>}
      {on !== undefined && <Toggle on={on} label={label} />}
    </li>
  );
}

export function SimulationTab({ settings, loading, error, retry }: { settings?: AppSettings; loading: boolean; error: unknown; retry: () => void }) {
  const health = useQuery({ queryKey: ["settings", "health"], queryFn: () => api.get<Record<string, unknown>>("/health"), refetchInterval: 15_000 });
  const ready = useQuery({ queryKey: ["settings", "ready"], queryFn: () => api.get<Record<string, unknown>>("/health/ready"), refetchInterval: 15_000 });
  const p = (settings?.payments ?? {}) as Payments;
  const cur = p.currency ?? "TND";
  return (
    <>
      <div className="border-b border-hair px-5 py-[18px]">
        <h3 className="text-base font-extrabold">Simulation and risk</h3>
        <p className="mt-0.5 text-[13px] text-t3">No real gateway is connected. These thresholds drive the Security agent&apos;s rules and are set on the server.</p>
      </div>
      {loading ? (
        <div className="grid gap-3 p-5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : error || !settings ? (
        <div className="p-5">
          <ErrorState error={error} onRetry={retry} />
        </div>
      ) : (
        <ul>
          <Row label="Single-transaction threshold" desc="Payments at or above this amount are held for a human." value={p.high_value_threshold ? formatMoney(p.high_value_threshold, cur, { trim: true }) : "—"} />
          <Row label="Velocity rule" desc={`Attempts allowed per customer in ${p.velocity_window_minutes ?? "—"} minutes.`} value={`${p.velocity_max_attempts ?? "—"} attempts`} />
          <Row label="Failed attempts" desc="Declines before the next payment is held." value={`${p.failed_attempts_threshold ?? "—"} declines`} />
          <Row label="Four-eyes rule" desc="A requester can never approve their own request." on />
          <Row label="Simulated provider" desc={`Provider "${p.provider ?? "simulated"}". No live or sandbox gateway is connected.`} on />
          <Row label="Real payments" desc="Hard-disabled for the challenge." on={!!p.live_mode} />
        </ul>
      )}
      {settings && (
        <div className="border-t border-hair px-5 py-3.5">
          <p className="text-[12.5px] font-bold text-t2">Test methods</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {(p.test_methods ?? []).map((m) => (
              <li key={m.id} className="inline-flex items-center gap-2 rounded-lg border border-hair bg-panel2 px-2.5 py-1 text-xs">
                {m.label} <span className="num text-t4">{m.id}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-t4">Fictional methods only. There are no card fields anywhere in the product.</p>
        </div>
      )}
      <div className="border-t border-hair px-5 py-3.5">
        <div className="flex items-center justify-between">
          <p className="text-[12.5px] font-bold text-t2">System health</p>
          <button type="button" aria-label="Recheck health" onClick={() => (health.refetch(), ready.refetch())} className="grid size-8 place-items-center rounded-[9px] text-t3 hover:bg-panel2">
            <RotateCw aria-hidden className={health.isFetching || ready.isFetching ? "size-3.5 animate-spin" : "size-3.5"} />
          </button>
        </div>
        <ul className="mt-2 grid gap-2 text-[13px]">
          {(
            [
              ["API", health, "status", "ok"],
              ["Database", ready, "status", "ready"],
            ] as const
          ).map(([name, q, k, ok]) => {
            const good = !q.error && q.data?.[k] === ok;
            return (
              <li key={name} className="flex items-center justify-between gap-3">
                <span className="font-semibold">{name}</span>
                <span className="flex items-center gap-2 text-xs text-t3">
                  {q.dataUpdatedAt > 0 && <TimeAgo date={new Date(q.dataUpdatedAt).toISOString()} />}
                  {q.isLoading ? <Skeleton className="h-5 w-16" /> : <StatusBadge status={good ? "SUCCEEDED" : "FAILED"} label={good ? "Healthy" : "Unhealthy"} />}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-t4">
          Environment <span className="num">{settings?.environment ?? "—"}</span> · checked every 15 s.
        </p>
      </div>
    </>
  );
}
