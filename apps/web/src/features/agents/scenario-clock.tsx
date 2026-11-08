"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useEvents } from "@/hooks/use-events";
import { SCENARIOS, type ActorId, type ScenarioId, type ScenarioStep } from "@/lib/fixtures";
import type { AppEvent } from "@/lib/types";

export const STEP_MS = 1900;
export const THREAD_MAX = 8;

/** One agent-to-agent message on the canvas / hand-offs panel / live feed. */
export interface Handoff extends ScenarioStep {
  id: string;
  /** Rows containing HOLD / REJECTED / BLOCKED / alert get the danger fill (README). */
  danger: boolean;
  /** true when synthesised from a live `use-events` event rather than the scenario script. */
  live: boolean;
  at: number;
  /** Scenario step index, or -1 for live events. */
  step: number;
}

export interface ScenarioClock {
  scenario: ScenarioId;
  steps: ScenarioStep[];
  total: number;
  /** 0..total-1 */
  step: number;
  current: ScenarioStep;
  playing: boolean;
  /** Last 8 hand-offs, newest first (scenario steps + live events). */
  thread: Handoff[];
  setScenario: (id: ScenarioId) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  reset: () => void;
  stepTo: (n: number) => void;
}

const DANGER = /\b(HOLD|REJECTED|BLOCKED)\b|alert/i;
export const isDangerHandoff = (h: Pick<ScenarioStep, "type" | "text">) => DANGER.test(h.type) || DANGER.test(h.text);

let seq = 0;
const mk = (s: ScenarioStep, step: number, live = false): Handoff => ({ ...s, id: `h${++seq}`, danger: isDangerHandoff(s), live, at: Date.now(), step });

/** Map a live event onto a hand-off (README "Scenario clock"): agent.started -> orchestrator→agent, approval.requested -> →human. */
export function handoffFromEvent(e: AppEvent): Handoff | null {
  if (e.type === "agent.started" && e.agent_id) {
    const task = typeof e.data?.task_type === "string" ? e.data.task_type : "agent.started";
    return mk({ from: "orchestrator", to: e.agent_id as ActorId, type: task, text: e.summary, caption: e.summary }, -1, true);
  }
  if (e.type === "approval.requested") {
    return mk({ from: (e.agent_id ?? "payment") as ActorId, to: "human", type: "approval.request", text: e.summary, caption: "A human must decide" }, -1, true);
  }
  return null;
}

const Ctx = createContext<ScenarioClock | null>(null);

/**
 * One 1.9s interval drives the dashboard canvas, hand-offs panel, live feed and demo control.
 * Behaviour matches the prototype: steps 0..N-1, a one-tick pause on the last step, then wraps to 0.
 * Changing the scenario resets to step 0. Live `use-events` events are appended to the thread.
 */
export function ScenarioClockProvider({ children, initial = "suspicious", autoplay = true }: { children: ReactNode; initial?: ScenarioId; autoplay?: boolean }) {
  const [scenario, setScenarioState] = useState<ScenarioId>(initial);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(autoplay);
  const [thread, setThread] = useState<Handoff[]>(() => [mk(SCENARIOS[initial].steps[0], 0)]);
  const holdRef = useRef(false); // one-tick pause at the end before wrapping
  const stepRef = useRef(0); // mirror of `step` for the interval (keeps the state updater pure)
  const steps = SCENARIOS[scenario].steps;
  const total = steps.length;

  const push = useCallback((h: Handoff, replace = false) => setThread((t) => (replace ? [h] : [h, ...t]).slice(0, THREAD_MAX)), []);

  const goTo = useCallback(
    (n: number, s: ScenarioId = scenario) => {
      const list = SCENARIOS[s].steps;
      const clamped = Math.max(0, Math.min(list.length - 1, n));
      holdRef.current = false;
      stepRef.current = clamped;
      setStep(clamped);
      // Rebuild the scripted part of the thread so skipping around stays coherent; keep live rows.
      setThread((t) => {
        const live = t.filter((h) => h.live);
        const scripted = list.slice(0, clamped + 1).map((x, i) => mk(x, i)).reverse();
        return [...scripted, ...live].sort((a, b) => b.at - a.at || b.step - a.step).slice(0, THREAD_MAX);
      });
    },
    [scenario],
  );

  const setScenario = useCallback(
    (id: ScenarioId) => {
      if (id === scenario) return;
      setScenarioState(id);
      goTo(0, id);
    },
    [scenario, goTo],
  );

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const s = stepRef.current;
      if (s >= total - 1) {
        if (!holdRef.current) {
          holdRef.current = true; // linger one tick on the final step
          return;
        }
        holdRef.current = false;
        stepRef.current = 0;
        setStep(0);
        push(mk(steps[0], 0), true);
        return;
      }
      stepRef.current = s + 1;
      setStep(s + 1);
      push(mk(steps[s + 1], s + 1));
    }, STEP_MS);
    return () => clearInterval(t);
  }, [playing, total, steps, push]);

  // Live events: skip the catch-up batch on mount, then append new hand-offs.
  const { events } = useEvents();
  const seen = useRef<number | null>(null);
  useEffect(() => {
    const newest = events[0]?.id;
    if (newest === undefined) return;
    if (seen.current === null) {
      seen.current = newest;
      return;
    }
    const fresh = events.filter((e) => e.id > seen.current!).sort((a, b) => a.id - b.id);
    seen.current = newest;
    for (const e of fresh) {
      const h = handoffFromEvent(e);
      if (h) push(h);
    }
  }, [events, push]);

  const value = useMemo<ScenarioClock>(
    () => ({
      scenario,
      steps,
      total,
      step,
      current: steps[step] ?? steps[0],
      playing,
      thread,
      setScenario,
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      toggle: () => setPlaying((p) => !p),
      reset: () => goTo(0),
      stepTo: (n: number) => goTo(n),
    }),
    [scenario, steps, total, step, playing, thread, setScenario, goTo],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Shared scenario clock. Must be used under `ScenarioClockProvider` (mounted in the admin shell). */
export function useScenarioClock(): ScenarioClock {
  const v = useContext(Ctx);
  if (!v) throw new Error("useScenarioClock must be used inside ScenarioClockProvider");
  return v;
}
