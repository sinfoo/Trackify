"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, Coins, Compass, GitBranch, Hand, Lightbulb, Loader2, MessageSquareText, Mic, Shield, Sparkles, Users, X, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, TimeAgo, TonePill, humanize, type Tone } from "@/components/ui-kit";
import { api, ApiError } from "@/lib/api";
import { formatPercent } from "@/lib/format";
import { can } from "@/lib/permissions";
import { qk, useMe } from "@/lib/queries";
import type { Paged, Recommendation } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Page } from "@/features/security/shared";

const label = (s: string) => humanize(String(s ?? "").toUpperCase());

type Status = "ACTIVE" | "SUPERSEDED";
type Feedback = NonNullable<Recommendation["feedback"]>;

// Backend stores confidence as a float; accept 0-1 or 0-100.
export const confidencePct = (c: number) => formatPercent(c > 1 ? c / 100 : c, { digits: 0 });
const confidenceNum = (c: number) => Math.round(c > 1 ? c : c * 100);

export function useRecommendations(status: Status, pageSize = 50) {
  return useQuery({
    queryKey: [...qk.strategy, "recommendations", status, pageSize],
    queryFn: () => api.get<Paged<Recommendation>>("/strategy/recommendations", { query: { status, page_size: pageSize } }),
    refetchInterval: 30_000, // strategy agent regenerates after payments; no event invalidates qk.strategy
  });
}

const errMsg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Request failed");

const CAT_ICON: Record<string, LucideIcon> = { PRICING: Coins, SCRIPT: Mic, "SALES SCRIPT": Mic, CAPACITY: Users, "CUSTOMER JOURNEY": GitBranch, JOURNEY: GitBranch, RISK: Shield };
const PRIORITY_TONE: Record<string, Tone> = { HIGH: "warning", MEDIUM: "info", LOW: "neutral" };

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
      toast.success(d.total ? `Strategy agent ran: ${d.total} recommendation${d.total === 1 ? "" : "s"} generated` : "Strategy agent ran: no new recommendations from current data");
      void qc.invalidateQueries({ queryKey: qk.strategy });
    },
    onError: (e) => toast.error(`Generation failed: ${errMsg(e)}`),
  });

  return (
    <Page
      title="Strategy"
      description="Business recommendations from the Strategy agent. Facts come from data; hypotheses are model or rule output to verify before acting."
      actions={
        <>
          <div role="group" aria-label="Recommendation status" className="inline-flex rounded-xl border border-hair bg-panel p-[3px]">
            {(["ACTIVE", "SUPERSEDED"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={status === s}
                onClick={() => setStatus(s)}
                className={cn("h-8 rounded-[9px] px-3 text-[12.5px] font-bold transition-colors", status === s ? "bg-text text-bg" : "text-t2 hover:text-text")}
              >
                {s === "ACTIVE" ? "Active" : "History"}
              </button>
            ))}
          </div>
          {canWrite && (
            <button
              type="button"
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
              className="inline-flex h-10 items-center gap-[7px] rounded-xl bg-brand px-4 text-[13.5px] font-extrabold text-on-brand shadow-brand disabled:opacity-60"
            >
              {generate.isPending ? <Loader2 aria-hidden className="size-[15px] animate-spin" /> : <Sparkles aria-hidden className="size-[15px]" strokeWidth={2.2} />}
              {generate.isPending ? "Generating…" : "Generate now"}
            </button>
          )}
        </>
      }
    >
      {recs.error ? (
        <ErrorState error={recs.error} onRetry={() => recs.refetch()} />
      ) : recs.isPending ? (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr))]">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72 rounded-[22px]" />
          ))}
        </div>
      ) : recs.data.items.length === 0 ? (
        <EmptyState
          icon={Compass}
          title={status === "ACTIVE" ? "No active recommendations" : "No past recommendations"}
          description={status === "ACTIVE" && canWrite ? "Run the strategy agent to analyse current data." : undefined}
        />
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr))]">
          {recs.data.items.map((r) => (
            <RecommendationCard key={r.id} rec={r} canWrite={canWrite && status === "ACTIVE"} />
          ))}
        </div>
      )}
      {recs.data && recs.data.items.length < recs.data.total && (
        <p className="text-[13px] text-t3">
          Showing <span className="num">{recs.data.items.length}</span> of <span className="num">{recs.data.total}</span>
        </p>
      )}
    </Page>
  );
}

function RecommendationCard({ rec, canWrite }: { rec: Recommendation; canWrite: boolean }) {
  const [note, setNote] = useState("");
  const [noting, setNoting] = useState(false);
  const qc = useQueryClient();
  const fb = useMutation({
    mutationFn: (feedback: Feedback) => api.post<Recommendation>(`/strategy/recommendations/${rec.id}/feedback`, { feedback, note: note.trim() }),
    onSuccess: (r, feedback) => {
      toast.success(
        feedback === "ACCEPTED"
          ? rec.requires_approval
            ? "Accepted. An approval request was created for a human."
            : "Recommendation accepted and logged."
          : feedback === "DEFERRED"
            ? "Deferred. The agent will revisit it after the next run."
            : `Marked ${label(r.feedback ?? "rejected")}.`,
      );
      setNote("");
      setNoting(false);
      void qc.invalidateQueries({ queryKey: qk.strategy });
    },
    onError: (e) => toast.error(`Could not save feedback: ${errMsg(e)}`),
  });
  const Icon = CAT_ICON[label(rec.category).toUpperCase()] ?? Lightbulb;
  const prio = (rec.priority ?? "").toUpperCase();
  const conf = confidenceNum(rec.confidence);
  const open = !rec.feedback && rec.status === "ACTIVE";
  const fbTone: Tone = rec.feedback === "ACCEPTED" ? "success" : rec.feedback === "REJECTED" ? "danger" : "neutral";
  const fbLabel = rec.feedback === "ACCEPTED" ? (rec.requires_approval ? "Sent to approvals" : "Accepted") : rec.feedback === "REJECTED" ? "Rejected" : "Deferred";
  const FbIcon = rec.feedback === "ACCEPTED" ? Check : rec.feedback === "REJECTED" ? X : Clock;
  const busy = (f: Feedback) => fb.isPending && fb.variables === f;

  return (
    <article className="anim-rise flex flex-col gap-3.5 rounded-[22px] border border-hair bg-panel p-5 shadow-card" aria-labelledby={`rec-${rec.id}`}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-c-strategy-bg text-c-strategy">
          <Icon aria-hidden className="size-[18px]" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11.5px] font-extrabold tracking-[.06em] uppercase text-t4">{label(rec.category)}</span>
            <TonePill tone={PRIORITY_TONE[prio] ?? "neutral"} label={`${label(prio)} priority`} size="sm" weight={800} iconless />
            {rec.requires_approval && <TonePill tone="warning" icon={Hand} label="needs approval" size="sm" weight={800} />}
            <span className="ml-auto text-[11.5px] text-t4">
              {label(rec.source)} · <TimeAgo date={rec.created_at} />
            </span>
          </div>
          <h3 id={`rec-${rec.id}`} className="mt-1.5 text-[17px] leading-[1.25] font-extrabold tracking-[-0.015em]">
            {rec.title}
          </h3>
          {rec.description && <p className="mt-1 text-[13px] text-t3">{rec.description}</p>}
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-[11.5px] font-bold tracking-[.08em] uppercase text-success">Observed facts</p>
        <ul className="grid gap-[5px]">
          {rec.observed_facts?.length ? (
            rec.observed_facts.map((f, i) => (
              <li key={i} className="flex gap-2 text-[13.5px] leading-[1.45] text-t2">
                <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" strokeWidth={2.6} />
                {f}
              </li>
            ))
          ) : (
            <li className="text-[13px] text-t3">No facts recorded.</li>
          )}
        </ul>
        <p className="mt-1 text-[11.5px] font-bold tracking-[.08em] uppercase text-c-strategy">Hypothesis to verify</p>
        <p className="border-l-2 border-c-strategy pl-2.5 text-[13.5px] leading-[1.5] text-t2">{rec.hypothesis}</p>
        {(rec.expected_impact || rec.suggested_action) && (
          <p className="text-[12.5px] leading-[1.5] text-t3">
            {rec.expected_impact && (
              <>
                <span className="font-bold text-t2">Expected impact. </span>
                {rec.expected_impact}{" "}
              </>
            )}
            {rec.suggested_action && (
              <>
                <span className="font-bold text-t2">Suggested action. </span>
                {rec.suggested_action}
              </>
            )}
          </p>
        )}
        {rec.feedback_note && (
          <p className="text-[12.5px] text-t3">
            <span className="font-bold text-t2">Feedback note. </span>
            {rec.feedback_note}
          </p>
        )}
      </div>

      {noting && (
        <Input aria-label={`Feedback note for ${rec.title}`} placeholder="Optional note for the decision" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2.5 border-t border-hair pt-1.5">
        <span className="inline-flex items-center gap-2 text-xs text-t3">
          <span className="h-[5px] w-[60px] overflow-hidden rounded-[3px] bg-panel3" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={conf} aria-label="Confidence">
            <span className="block h-full bg-brand" style={{ width: `${conf}%` }} />
          </span>
          <span className="whitespace-nowrap">confidence {conf}%</span>
        </span>
        <span className="ml-auto flex flex-wrap justify-end gap-1.5">
          {rec.feedback && <TonePill tone={fbTone} icon={FbIcon} label={fbLabel} size="lg" weight={800} className="h-8 rounded-[10px] px-3 text-[12.5px]" />}
          {open && canWrite && (
            <>
              <button
                type="button"
                aria-label="Add a note"
                aria-pressed={noting}
                onClick={() => setNoting((v) => !v)}
                className={cn("grid h-8 w-8 place-items-center rounded-[10px] border border-hair bg-panel2 text-t2 hover:bg-panel3", noting && "text-text")}
              >
                <MessageSquareText aria-hidden className="size-3.5" />
              </button>
              <button type="button" disabled={fb.isPending} onClick={() => fb.mutate("REJECTED")} className="h-8 rounded-[10px] border border-hair bg-panel2 px-3 text-[12.5px] font-bold text-danger hover:bg-panel3">
                {busy("REJECTED") ? "…" : "Reject"}
              </button>
              <button type="button" disabled={fb.isPending} onClick={() => fb.mutate("DEFERRED")} className="h-8 rounded-[10px] border border-hair bg-panel2 px-3 text-[12.5px] font-bold text-t2 hover:bg-panel3">
                {busy("DEFERRED") ? "…" : "Defer"}
              </button>
              <button
                type="button"
                disabled={fb.isPending}
                onClick={() => fb.mutate("ACCEPTED")}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-[10px] bg-text px-3 py-1.5 text-[12.5px] leading-[1.2] font-extrabold whitespace-nowrap text-bg disabled:opacity-60"
              >
                {busy("ACCEPTED") ? <Loader2 aria-hidden className="size-[13px] animate-spin" /> : <Check aria-hidden className="size-[13px]" strokeWidth={2.6} />}
                {rec.requires_approval ? "Accept · needs approval" : "Accept"}
              </button>
            </>
          )}
        </span>
      </div>
    </article>
  );
}
