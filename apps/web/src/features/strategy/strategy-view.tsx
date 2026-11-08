"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, Compass, Lightbulb, ListChecks, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, humanize, PageHeader, StatusBadge, TimeAgo } from "@/components/ui-kit";
import { api, ApiError } from "@/lib/api";
import { formatPercent } from "@/lib/format";
import { can } from "@/lib/permissions";
import { qk, useMe } from "@/lib/queries";
import type { Paged, Recommendation } from "@/lib/types";
import { cn } from "@/lib/utils";

const label = (s: string) => humanize(String(s ?? "").toUpperCase());

type Status = "ACTIVE" | "SUPERSEDED";
type Feedback = NonNullable<Recommendation["feedback"]>;

// Backend stores confidence as a float; accept 0-1 or 0-100.
export const confidencePct = (c: number) => formatPercent(c > 1 ? c / 100 : c, { digits: 0 });

export function useRecommendations(status: Status, pageSize = 50) {
  return useQuery({
    queryKey: [...qk.strategy, "recommendations", status, pageSize],
    queryFn: () => api.get<Paged<Recommendation>>("/strategy/recommendations", { query: { status, page_size: pageSize } }),
    refetchInterval: 30_000, // strategy agent regenerates after payments; no event invalidates qk.strategy
  });
}

const errMsg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Request failed");

export function StrategyView() {
  const [status, setStatus] = useState<Status>("ACTIVE");
  // ponytail: one page of 200 (backend max); add pagination if history outgrows it.
  const recs = useRecommendations(status, 200);
  const { data: user } = useMe();
  const canWrite = can(user, "strategy:write");
  const qc = useQueryClient();

  const generate = useMutation({
    mutationFn: () => api.post<{ items: Recommendation[]; total: number }>("/strategy/generate"),
    onSuccess: (d) => {
      toast.success(d.total ? `${d.total} recommendation${d.total === 1 ? "" : "s"} generated` : "No new recommendations from current data");
      void qc.invalidateQueries({ queryKey: qk.strategy });
    },
    onError: (e) => toast.error(`Generation failed: ${errMsg(e)}`),
  });

  return (
    <>
      <PageHeader
        title="Strategy"
        description="Business recommendations from the strategy agent. Facts come from data; hypotheses are model or rule output to verify."
        actions={
          canWrite && (
            <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
              {generate.isPending ? <Loader2 aria-hidden className="animate-spin" /> : <Sparkles aria-hidden />}
              {generate.isPending ? "Generating" : "Generate now"}
            </Button>
          )
        }
      />

      <div role="group" aria-label="Recommendation status" className="mb-4 inline-flex rounded-lg border bg-card p-1">
        {(["ACTIVE", "SUPERSEDED"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-150",
              status === s && "bg-secondary text-foreground",
            )}
          >
            {s === "ACTIVE" ? "Active" : "History"}
            {status === s && recs.data && <span className="num ml-1.5 text-muted-foreground">{recs.data.total}</span>}
          </button>
        ))}
      </div>

      {recs.error ? (
        <ErrorState error={recs.error} onRetry={() => recs.refetch()} />
      ) : recs.isPending ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      ) : recs.data.items.length === 0 ? (
        <EmptyState
          icon={Compass}
          title={status === "ACTIVE" ? "No active recommendations" : "No past recommendations"}
          description={status === "ACTIVE" && canWrite ? "Run the strategy agent to analyse current data." : undefined}
        />
      ) : (
        <ul className="space-y-4">
          {recs.data.items.map((r) => (
            <li key={r.id}>
              <RecommendationCard rec={r} canWrite={canWrite && status === "ACTIVE"} />
            </li>
          ))}
        </ul>
      )}
      {recs.data && recs.data.items.length < recs.data.total && (
        <p className="mt-4 text-sm text-muted-foreground">
          Showing <span className="num">{recs.data.items.length}</span> of <span className="num">{recs.data.total}</span>
        </p>
      )}
    </>
  );
}

const PRIORITY_ICON: Record<string, string> = { HIGH: "text-danger-text", MEDIUM: "text-warning-text", LOW: "text-muted-foreground" };

function RecommendationCard({ rec, canWrite }: { rec: Recommendation; canWrite: boolean }) {
  const [note, setNote] = useState("");
  const qc = useQueryClient();
  const fb = useMutation({
    mutationFn: (feedback: Feedback) =>
      api.post<Recommendation>(`/strategy/recommendations/${rec.id}/feedback`, { feedback, note: note.trim() }),
    onSuccess: (r) => {
      toast.success(`Marked ${label(r.feedback ?? "")}`);
      setNote("");
      void qc.invalidateQueries({ queryKey: qk.strategy });
    },
    onError: (e) => toast.error(`Could not save feedback: ${errMsg(e)}`),
  });
  const metrics = Object.entries(rec.metrics ?? {}).filter(([, v]) => v === null || typeof v !== "object");

  return (
    <article className="rounded-xl border bg-card p-5" aria-labelledby={`rec-${rec.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="rounded-full border px-2.5 py-0.5 text-xs font-medium">{label(rec.category)}</span>
            <span className={cn("inline-flex items-center gap-1 font-medium", PRIORITY_ICON[rec.priority?.toUpperCase()])}>
              <ListChecks aria-hidden className="size-4" />
              {label(rec.priority ?? "")} priority
            </span>
            <span>
              Confidence <span className="num text-foreground">{confidencePct(rec.confidence)}</span> (model/heuristic estimate)
            </span>
          </div>
          <h2 id={`rec-${rec.id}`} className="text-lg font-semibold">
            {rec.title}
          </h2>
          {rec.description && <p className="mt-1 text-muted-foreground">{rec.description}</p>}
        </div>
        <div className="flex flex-col items-start gap-1.5 text-sm text-muted-foreground sm:items-end">
          {rec.requires_approval && <StatusBadge status="REQUIRES_APPROVAL" label="Requires admin approval" />}
          {rec.feedback && <StatusBadge status={rec.feedback} />}
          <span>
            {label(rec.source)} · <TimeAgo date={rec.created_at} />
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section aria-label="Observed facts">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <Check aria-hidden className="size-4 text-success-text" /> Observed facts
            <span className="font-normal text-muted-foreground">from data</span>
          </h3>
          {rec.observed_facts?.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {rec.observed_facts.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No facts recorded.</p>
          )}
          {metrics.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Metrics">
              {metrics.map(([k, v]) => (
                <li key={k} className="rounded-md bg-muted px-2 py-0.5 text-xs">
                  <span className="text-muted-foreground">{label(k)}</span> <span className="num">{String(v)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="Hypothesis" className="rounded-lg border border-dashed bg-muted/40 p-4">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
            <Lightbulb aria-hidden className="size-4 text-info-text" /> Hypothesis
            <span className="font-normal text-muted-foreground">generated, not verified</span>
          </h3>
          <p className="text-sm italic">{rec.hypothesis}</p>
        </section>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-muted-foreground">Expected impact</dt>
          <dd>{rec.expected_impact}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted-foreground">Suggested action</dt>
          <dd>{rec.suggested_action}</dd>
        </div>
      </dl>
      {rec.feedback_note && (
        <p className="mt-3 text-sm text-muted-foreground">
          Feedback note: <span className="text-foreground">{rec.feedback_note}</span>
        </p>
      )}

      {canWrite && (
        <div className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center">
          <Input
            aria-label={`Feedback note for ${rec.title}`}
            placeholder="Optional note"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="sm:max-w-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={fb.isPending} onClick={() => fb.mutate("ACCEPTED")}>
              <Check aria-hidden /> Accept
            </Button>
            <Button size="sm" variant="outline" disabled={fb.isPending} onClick={() => fb.mutate("REJECTED")}>
              <X aria-hidden /> Reject
            </Button>
            <Button size="sm" variant="outline" disabled={fb.isPending} onClick={() => fb.mutate("DEFERRED")}>
              <Clock aria-hidden /> Defer
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
