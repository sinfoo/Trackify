"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Play, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { ErrorState, PageHeader, SimulatedBadge } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvents } from "@/hooks/use-events";
import { api, ApiError } from "@/lib/api";
import { can } from "@/lib/permissions";
import { useMe } from "@/lib/queries";
import type { DemoRunResult, DemoScenario, DemoScenarioId } from "@/lib/types";
import { EventRow } from "@/features/activity/event-row";
import { JsonBlock } from "@/features/agents/json-block";

const FOLLOW_UP: Partial<Record<DemoScenarioId, { href: string; label: string }>> = {
  suspicious_activity: { href: "/approvals", label: "Open Approval Center" },
  prompt_injection: { href: "/security", label: "Open Security" },
  failed_payment: { href: "/payments", label: "Open Payments" },
  business_intelligence: { href: "/strategy", label: "Open Strategy" },
};

export function DemoPanel() {
  const { data: me } = useMe();
  const scenarios = useQuery({ queryKey: ["demo", "scenarios"], queryFn: () => api.get<DemoScenario[]>("/demo/scenarios"), staleTime: Infinity });
  const { events } = useEvents();
  const [run, setRun] = useState<{ id: DemoScenarioId; baseline: number } | null>(null);
  const qc = useQueryClient();

  const exec = useMutation({
    mutationFn: (id: DemoScenarioId) => api.post<DemoRunResult>(`/demo/scenarios/${id}/run`),
    onMutate: (id) => setRun({ id, baseline: events[0]?.id ?? 0 }),
    onSuccess: () => qc.invalidateQueries(),
  });

  const feed = run ? events.filter((e) => e.id > run.baseline) : [];
  const canRun = can(me, "workflows:write");

  return (
    <>
      <PageHeader
        title="Demo control"
        description="Run a scripted scenario through the real orchestrator, agents and rules. Every customer is fictional."
        actions={<SimulatedBadge label="Simulated payments" />}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-label="Scenarios">
          {scenarios.error ? (
            <ErrorState error={scenarios.error} onRetry={() => scenarios.refetch()} />
          ) : !scenarios.data ? (
            <Skeleton className="h-[480px] w-full" />
          ) : (
            <ol className="divide-y rounded-xl border bg-card">
              {scenarios.data.map((s, i) => {
                const mine = run?.id === s.id;
                return (
                  <li key={s.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start">
                    <span className="num text-2xl leading-none font-semibold text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-xl font-semibold">{s.title}</h2>
                      <p className="mt-1 text-base text-muted-foreground">{s.description}</p>
                      <ol className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
                        {s.steps.map((step, j) => (
                          <li key={step} className="inline-flex items-center gap-1.5">
                            {j > 0 && <ArrowRight aria-hidden className="size-3.5 text-muted-foreground" />}
                            <span className="rounded-md bg-muted px-2 py-0.5">{step}</span>
                          </li>
                        ))}
                      </ol>
                      {mine && exec.data && <RunResult scenario={s.id} result={exec.data} />}
                      {mine && exec.error && <ErrorState error={exec.error} title="Scenario failed" className="mt-3" />}
                    </div>
                    {canRun && (
                      <Button size="lg" className="h-11 px-5 text-base" onClick={() => exec.mutate(s.id)} disabled={exec.isPending}>
                        <Play aria-hidden /> {exec.isPending && mine ? "Running" : "Run"}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          {!canRun && <p className="mt-3 text-sm text-muted-foreground">Your role can view scenarios but not run them.</p>}
          {can(me, "settings:write") && <ResetControl />}
        </section>

        <section aria-label="Live feed for this run" className="xl:sticky xl:top-20 xl:h-fit">
          <div className="rounded-xl border bg-card">
            <div className="flex items-center justify-between gap-2 border-b px-5 py-3">
              <h2 className="text-lg font-semibold">Live feed</h2>
              {run && <span className="num text-sm text-muted-foreground">{feed.length} events</span>}
            </div>
            {!run ? (
              <p className="px-5 py-10 text-center text-base text-muted-foreground">Run a scenario to watch the agents work, event by event.</p>
            ) : feed.length === 0 ? (
              <p className="px-5 py-10 text-center text-base text-muted-foreground" aria-live="polite">
                {exec.isPending ? "Agents are working" : "Waiting for events"}
              </p>
            ) : (
              <ol className="max-h-[70vh] divide-y overflow-y-auto" aria-live="polite">
                {feed.map((e) => (
                  <EventRow key={e.id} e={e} fresh large />
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>
      <PrototypeLimits />
    </>
  );
}

function RunResult({ scenario, result }: { scenario: DemoScenarioId; result: DemoRunResult }) {
  const follow = FOLLOW_UP[scenario];
  return (
    <div className="mt-4 space-y-3 rounded-lg border border-success/30 bg-success/5 p-4" aria-live="polite">
      <p className="text-lg font-medium">{result.summary}</p>
      <div className="flex flex-wrap gap-2">
        {result.workflow_id && (
          <Button asChild variant="outline">
            <Link href={`/workflows/${result.workflow_id}`}>
              Open workflow <ArrowRight aria-hidden />
            </Link>
          </Button>
        )}
        {follow && (
          <Button asChild variant="outline">
            <Link href={follow.href}>
              {follow.label} <ArrowRight aria-hidden />
            </Link>
          </Button>
        )}
        <Button asChild variant="ghost">
          <Link href="/activity">Live activity</Link>
        </Button>
      </div>
      <JsonBlock value={result.details} label="Details" />
    </div>
  );
}

function ResetControl() {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const reset = useMutation({
    mutationFn: () => api.post<{ ok: boolean; message: string }>("/demo/reset"),
    onSuccess: (r) => {
      toast.success(r?.message ?? "Demo data reset");
      setConfirming(false);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Reset failed"),
  });
  return (
    <div className="mt-6 rounded-xl border p-5">
      <h2 className="font-semibold">Reset demo data</h2>
      <p className="mt-1 text-sm text-muted-foreground">Wipes conversations, payments, alerts and approvals, then reseeds the fictional dataset.</p>
      {!confirming ? (
        <Button variant="destructive" className="mt-3" onClick={() => setConfirming(true)}>
          <RotateCcw aria-hidden /> Reset demo data
        </Button>
      ) : (
        <div role="group" aria-label="Confirm reset" className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2">
          <span className="text-sm font-medium">This deletes everything created since the last seed. Continue?</span>
          <Button variant="destructive" size="sm" onClick={() => reset.mutate()} disabled={reset.isPending} autoFocus>
            {reset.isPending ? "Resetting" : "Yes, reset everything"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

const LIMITS: { title: string; items: string[] }[] = [
  {
    title: "Prototype limits",
    items: [
      "All customers, offers and payments are fictional. No real card data is ever requested.",
      "Payments run on a simulated provider only; no live or sandbox gateway is connected.",
      "Voice uses the browser speech engine (best in Chrome or Edge) and only after explicit consent.",
      "Single server instance: live events and login rate limiting are kept in memory.",
    ],
  },
  {
    title: "Possible errors",
    items: [
      "Intent, sentiment and confidence are model or heuristic estimates, not verified facts.",
      "The injection filter is pattern-based: it can miss a rephrased attack or flag an unusual question.",
      "The revenue forecast is a linear trend on short simulated history.",
      "With a real AI provider, wording can vary; prices, statuses and decisions never come from model text.",
    ],
  },
  {
    title: "Human supervision required",
    items: [
      "Releasing any payment held by the Security agent (velocity, failures, duplicates, high value).",
      "Every refund, approved by a different administrator than the requester (four-eyes rule).",
      "Price changes and offer bundles suggested by the Strategy agent.",
      "Resolving security alerts and reviewing agent permission violations.",
    ],
  },
];

function PrototypeLimits() {
  return (
    <section aria-labelledby="limits-h" className="mt-8 rounded-xl border bg-card p-5 md:p-6">
      <h2 id="limits-h" className="text-xl font-semibold">
        What this prototype does not do on its own
      </h2>
      <p className="mt-1 text-muted-foreground">Stated openly so the agents are trusted for what they are.</p>
      <div className="mt-5 grid gap-6 md:grid-cols-3">
        {LIMITS.map((g) => (
          <div key={g.title}>
            <h3 className="font-semibold">{g.title}</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              {g.items.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
