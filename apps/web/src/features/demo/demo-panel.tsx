"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Brain,
  ChartLine,
  ChevronRight,
  CircleCheck,
  CircleDot,
  Clock,
  Compass,
  CreditCard,
  FlaskConical,
  Gauge,
  Hand,
  Lightbulb,
  Loader2,
  MessageCircle,
  Mic,
  Play,
  Receipt,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { AgentAvatar, ErrorState, Eyebrow } from "@/components/ui-kit";
import { useEvents } from "@/hooks/use-events";
import { api, ApiError } from "@/lib/api";
import { DEMO_TO_SCENARIO, SCENARIOS, type ScenarioId } from "@/lib/fixtures";
import { can } from "@/lib/permissions";
import { useMe } from "@/lib/queries";
import type { AppEvent, DemoRunResult, DemoScenario, DemoScenarioId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useScenarioClock, type Handoff } from "@/features/agents/scenario-clock";
import { Page } from "@/features/security/shared";

const FOLLOW: Record<string, string> = { approvals: "Open Approvals", workflows: "Open Workflows", payments: "Open Payments", security: "Open Security", strategy: "Open Strategy" };
const STEP_ICON: Record<string, LucideIcon> = {
  message: MessageCircle,
  SCREEN_INPUT: Shield,
  INPUT_CLEAN: ShieldCheck,
  INPUT_REJECTED: ShieldAlert,
  CUSTOMER_TURN: Mic,
  INTERACTION_RESULT: Brain,
  CUSTOMER_INSIGHT: Compass,
  CREATE_PAYMENT_SESSION: CreditCard,
  ASSESS_PAYMENT: Shield,
  RISK_DECISION: Gauge,
  "approval.request": Hand,
  HUMAN_RELEASE: UserCheck,
  PAYMENT_RESULT: Receipt,
  METRICS_UPDATED: ChartLine,
  UPDATE_METRICS: ChartLine,
  RECOMMENDATIONS: Lightbulb,
  "security.alert": TriangleAlert,
};
// Backend scenario order 01-05 follows the prototype.
const ORDER: DemoScenarioId[] = ["suspicious_activity", "successful_journey", "failed_payment", "prompt_injection", "business_intelligence"];

/** The Next dev proxy gives up after 30s and answers a bare 500 (no API envelope) while the API keeps running. */
const isProxyTimeout = (e: unknown) => e instanceof ApiError && /^HTTP_50[0-4]$/.test(e.code);

type Run = { id: DemoScenarioId; fixture: ScenarioId; baseline: number };

export function DemoPanel() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const clock = useScenarioClock();
  const scenarios = useQuery({ queryKey: ["demo", "scenarios"], queryFn: () => api.get<DemoScenario[]>("/demo/scenarios"), staleTime: Infinity });
  const { events } = useEvents();
  const [run, setRun] = useState<Run | null>(null);

  const exec = useMutation({
    mutationFn: (id: DemoScenarioId) => api.post<DemoRunResult>(`/demo/scenarios/${id}/run`),
    onMutate: (id) => {
      const fixture = DEMO_TO_SCENARIO[id];
      setRun({ id, fixture, baseline: events[0]?.id ?? 0 });
      // The shared clock drives this card's progress, the dashboard canvas and the hand-offs while the request runs.
      clock.setScenario(fixture);
      clock.stepTo(0);
      clock.play();
    },
    onSettled: (_, err) => {
      clock.stepTo(SCENARIOS[run?.fixture ?? clock.scenario].steps.length - 1);
      clock.pause();
      if (!err) qc.invalidateQueries();
    },
  });

  const list = [...(scenarios.data ?? [])].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  const feed = run ? events.filter((e) => e.id > run.baseline) : [];
  const canRun = can(me, "workflows:write");
  const running = exec.isPending;

  return (
    <Page
      title="Demo control"
      description="Run a scripted scenario through the real orchestrator, agents and rules. Every customer is fictional; every payment is simulated."
      actions={can(me, "settings:write") && <ResetControl />}
    >
      <div className="flex flex-wrap items-start gap-[18px]">
        <ol className="grid min-w-0 flex-[3_1_520px] gap-3" aria-label="Scenarios">
          {scenarios.error && (
            <li>
              <ErrorState error={scenarios.error} onRetry={() => scenarios.refetch()} />
            </li>
          )}
          {scenarios.isPending &&
            [0, 1, 2].map((i) => (
              <li key={i}>
                <Skeleton className="h-36 rounded-[22px]" />
              </li>
            ))}
          {list.map((s, i) => {
            const fixture = SCENARIOS[DEMO_TO_SCENARIO[s.id]];
            const mine = run?.id === s.id;
            const isRunning = mine && running;
            const done = mine && !running && !!exec.data;
            const stillRunning = mine && !running && isProxyTimeout(exec.error);
            const failed = mine && !running && exec.error && !stillRunning;
            const onClock = clock.scenario === fixture.id;
            return (
              <li
                key={s.id}
                className="flex flex-col items-start gap-4 rounded-[22px] border bg-panel px-5 py-[18px] transition-[border-color] duration-300 sm:flex-row"
                style={{ borderColor: mine ? "var(--brand)" : "var(--hair)", boxShadow: mine ? "0 0 0 4px var(--brand-bg)" : "var(--shadow)" }}
              >
                <span className="num pt-1 text-[26px] leading-none font-semibold text-t4">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-extrabold tracking-[-0.015em]">{s.title}</h3>
                  <p className="mt-1 text-[13.5px] text-t3">{s.description}</p>
                  <ol className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Agent hand-offs">
                    {fixture.steps.map((st, j) => {
                      const reached = mine && onClock && j <= clock.step;
                      const cur = mine && onClock && j === clock.step && running;
                      const Icon = STEP_ICON[st.type] ?? CircleDot;
                      return (
                        <li key={`${st.type}-${j}`} className="inline-flex items-center gap-1.5">
                          {j > 0 && <ChevronRight aria-hidden className="size-3 text-t4" />}
                          <span
                            className={cn("inline-flex h-[26px] items-center gap-[5px] rounded-lg px-[9px] text-xs font-bold transition-all duration-300", cur ? "bg-brand text-on-brand" : reached ? "bg-success-bg text-success" : "bg-panel2 text-t3")}
                            title={st.caption}
                          >
                            <Icon aria-hidden className="size-3" strokeWidth={2.2} />
                            {st.type}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                  <p className="mt-2 text-xs text-t4">{s.steps.join(" · ")}</p>
                  {done && exec.data && (
                    <div className="anim-pop-in mt-3 flex flex-wrap items-center gap-2.5 rounded-[14px] border border-success bg-success-bg px-3 py-2.5" style={{ animationDuration: "400ms" }} aria-live="polite">
                      <CircleCheck aria-hidden className="size-4 shrink-0 text-success" strokeWidth={2.4} />
                      <span className="flex-1 text-[13px] font-bold text-success">
                        Scenario completed: {exec.data.summary}
                        {exec.data.workflow_id && (
                          <>
                            {" · "}
                            <Link href={`/workflows/${exec.data.workflow_id}`} className="num text-success underline">
                              workflow {exec.data.workflow_id.slice(0, 8)}
                            </Link>
                          </>
                        )}
                      </span>
                      <Link href={`/${fixture.follow}`} className="text-[12.5px] font-extrabold text-success">
                        {FOLLOW[fixture.follow]} →
                      </Link>
                    </div>
                  )}
                  {stillRunning && (
                    <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-[14px] border border-warning bg-warning-bg px-3 py-2.5 text-[13px] text-warning" role="status">
                      <Clock aria-hidden className="size-4 shrink-0" />
                      <span className="flex-1">
                        <span className="font-extrabold">Still running on the server. </span>The AI provider is slow, so the browser stopped waiting after 30 seconds. Follow the agents in the live feed.
                      </span>
                      <Link href="/workflows" className="text-[12.5px] font-extrabold text-warning">
                        Open Workflows →
                      </Link>
                    </div>
                  )}
                  {failed && <ErrorState error={exec.error} title="Scenario failed" className="mt-3 py-5" />}
                </div>
                {canRun && (
                  <button
                    type="button"
                    onClick={() => exec.mutate(s.id)}
                    disabled={running}
                    className={cn("inline-flex h-11 shrink-0 items-center gap-[7px] self-center rounded-[13px] px-[18px] text-sm font-extrabold whitespace-nowrap transition-all duration-200 sm:self-start", isRunning ? "bg-panel3 text-text" : "bg-brand text-on-brand shadow-[0_6px_18px_rgba(245,166,35,.3)]", running && !isRunning && "opacity-50")}
                  >
                    {isRunning ? <Loader2 aria-hidden className="size-[15px] animate-spin" strokeWidth={2.4} /> : <Play aria-hidden className="size-[15px]" strokeWidth={2.4} />}
                    {isRunning ? (
                      <span className="num">
                        Running · step {Math.min(clock.step + 1, fixture.steps.length)}/{fixture.steps.length}
                      </span>
                    ) : mine ? (
                      "Run again"
                    ) : (
                      "Run"
                    )}
                  </button>
                )}
              </li>
            );
          })}
          {!canRun && scenarios.data && <li className="text-[13px] text-t3">Your role can view scenarios but not run them (workflows:write).</li>}
        </ol>

        <aside className="sticky top-[84px] flex max-h-[720px] min-w-0 flex-[1_1_320px] flex-col overflow-hidden rounded-[22px] border border-hair bg-panel shadow-card" aria-label="Live feed">
          <div className="flex items-center justify-between border-b border-hair px-[18px] py-4">
            <div>
              <Eyebrow>Live feed</Eyebrow>
              <h3 className="mt-0.5 text-base font-extrabold">{run ? scenarios.data?.find((s) => s.id === run.id)?.title ?? "Running" : "Nothing running"}</h3>
            </div>
            {run && <span className="num text-xs text-t3">{feed.length} events</span>}
          </div>
          {!run ? (
            <p className="px-5 py-12 text-center text-sm text-t3">Run a scenario to watch the agents work, event by event.</p>
          ) : (
            <ol className="flex flex-col gap-2 overflow-y-auto px-4 py-3" aria-live="polite">
              {feed.length === 0 && running && clock.thread.slice(0, 8).map((h) => <HandoffRow key={h.id} h={h} />)}
              {feed.length === 0 && !running && <li className="py-6 text-center text-[13px] text-t3">Waiting for events</li>}
              {feed.map((e) => (
                <EventRow key={e.id} e={e} />
              ))}
            </ol>
          )}
        </aside>
      </div>

      <section className="rounded-[22px] border border-hair bg-panel p-5 shadow-card" aria-labelledby="limits-h">
        <h3 id="limits-h" className="text-[17px] font-extrabold tracking-[-0.015em]">
          What this prototype does not do on its own
        </h3>
        <p className="mt-0.5 text-[13.5px] text-t3">Stated openly so the agents are trusted for what they are.</p>
        <div className="mt-4 grid gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
          {LIMITS.map((g) => (
            <div key={g.title}>
              <p className="flex items-center gap-2 text-[13.5px] font-extrabold">
                <g.icon aria-hidden className="size-[15px] text-brand-text" strokeWidth={2.2} />
                {g.title}
              </p>
              <ul className="mt-2 grid gap-1.5">
                {g.items.map((t) => (
                  <li key={t} className="flex gap-2 text-[13px] leading-[1.45] text-t2">
                    <span aria-hidden className="mt-2 size-[5px] shrink-0 rounded-full bg-t4" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </Page>
  );
}

/** Scripted hand-off row (prototype live feed) shown until the first real event arrives. */
function HandoffRow({ h }: { h: Handoff }) {
  return (
    <li className="anim-row-in rounded-[14px] border px-3 py-[9px]" style={{ animationDuration: "400ms", background: h.danger ? "var(--danger-bg)" : "var(--panel2)", borderColor: h.danger ? "var(--danger)" : "var(--hair)" }}>
      <div className="flex items-center gap-2">
        <AgentAvatar agentId={h.from} size={24} />
        <ArrowRight aria-hidden className="size-3 text-t4" />
        <AgentAvatar agentId={h.to} size={24} />
        <span className="num ml-auto text-[10.5px] text-t3">{h.type}</span>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-[1.4] text-t2">{h.text}</p>
    </li>
  );
}

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const DANGER = /security\.alert|approval\.requested|failed/;

/** Real event row in the same style. */
function EventRow({ e }: { e: AppEvent }) {
  const danger = DANGER.test(e.type);
  return (
    <li className="anim-row-in rounded-[14px] border px-3 py-[9px]" style={{ animationDuration: "400ms", background: danger ? "var(--danger-bg)" : "var(--panel2)", borderColor: danger ? "var(--danger)" : "var(--hair)" }}>
      <div className="flex items-center gap-2">
        <AgentAvatar agentId={e.agent_id ?? "orchestrator"} size={24} />
        <span className="num text-[10.5px] text-t3">{e.type}</span>
        <time dateTime={e.created_at} className="num ml-auto text-[10.5px] text-t3" suppressHydrationWarning>
          {timeFmt.format(new Date(e.created_at))}
        </time>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-[1.4] text-t2 [overflow-wrap:anywhere]">
        {e.summary}
        {e.workflow_id && (
          <>
            {" "}
            <Link href={`/workflows/${e.workflow_id}`} className="font-bold">
              Workflow →
            </Link>
          </>
        )}
      </p>
    </li>
  );
}

function ResetControl() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const reset = useMutation({
    mutationFn: () => api.post<{ ok: boolean; message: string }>("/demo/reset"),
    onSuccess: (r) => {
      toast.success(r?.message ?? "Demo data reset and reseeded");
      setOpen(false);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Reset failed"),
  });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-10 items-center gap-[7px] rounded-xl border border-danger bg-danger-bg px-4 text-[13.5px] font-extrabold text-danger">
        <RotateCcw aria-hidden className="size-[15px]" strokeWidth={2.2} /> Reset demo data
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset demo data?</DialogTitle>
            <DialogDescription>Wipes conversations, payments, alerts and approvals created since the last seed, then reseeds the fictional dataset. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => reset.mutate()} disabled={reset.isPending} autoFocus>
              {reset.isPending ? "Resetting…" : "Yes, reset everything"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const LIMITS: { title: string; icon: LucideIcon; items: string[] }[] = [
  {
    title: "Prototype limits",
    icon: FlaskConical,
    items: [
      "All customers, offers and payments are fictional. No real card data is ever requested.",
      "Payments run on a simulated provider only; no live or sandbox gateway is connected.",
      "Voice uses the browser speech engine (best in Chrome or Edge) and only after explicit consent.",
      "Single server instance: live events and login rate limiting are kept in memory.",
    ],
  },
  {
    title: "Possible errors",
    icon: TriangleAlert,
    items: [
      "Intent, sentiment and confidence are model or heuristic estimates, not verified facts.",
      "The injection filter is pattern-based: it can miss a rephrased attack or flag an unusual question.",
      "The revenue forecast is a linear trend on short simulated history.",
      "With a real AI provider, wording can vary; prices, statuses and decisions never come from model text.",
    ],
  },
  {
    title: "Human supervision required",
    icon: UserCheck,
    items: [
      "Releasing any payment held by the Security agent (velocity, failures, duplicates, high value).",
      "Every refund, approved by a different administrator than the requester (four-eyes rule).",
      "Price changes and offer bundles suggested by the Strategy agent.",
      "Resolving security alerts and reviewing agent permission violations.",
    ],
  },
];
