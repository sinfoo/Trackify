"use client";

import { useEffect, useState } from "react";
import { Hand } from "lucide-react";
import { AGENT_META } from "@/components/ui-kit";
import { AGENT_IDS, SCENARIOS } from "@/lib/fixtures";
import type { AgentId } from "@/lib/types";

const STEP_MS = 1900;
const STEPS = SCENARIOS.success.steps;

/** The card sits in the always-dark hero, so the dark agent palette is fixed here (README agent table). */
type Six = Exclude<AgentId, "orchestrator">;
const SIX = AGENT_IDS as readonly Six[];
const DARK: Record<Six, [string, string]> = {
  sales: ["#FFC65C", "rgba(245,166,35,.18)"],
  intelligence: ["#8FB4FF", "rgba(57,123,255,.2)"],
  payment: ["#7CF3B6", "rgba(61,203,139,.18)"],
  analyst: ["#7FE7DA", "rgba(45,212,191,.18)"],
  strategy: ["#FDE68A", "rgba(250,204,21,.16)"],
  security: ["#FDA4AF", "rgba(251,113,133,.18)"],
};
const DOES: Record<Six, string> = {
  sales: "Answers by text or voice",
  intelligence: "Reads intent and objections",
  payment: "Runs the simulated checkout",
  analyst: "Recomputes the numbers",
  strategy: "Writes recommendations",
  security: "Screens and holds risk",
};

/** Hero "Live hand-offs" card: 6 agent tiles lighting up along SCENARIOS.success, one step every 1.9s. */
export function LiveRelay() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % STEPS.length), STEP_MS);
    return () => clearInterval(t);
  }, []);
  const step = STEPS[i];
  const active = new Set<string>([step.from, step.to]);

  return (
    <div className="relative rounded-[28px] border border-white/10 bg-white/5 p-[22px] backdrop-blur-[10px] [animation:rise_.6s_.1s_cubic-bezier(.2,.8,.2,1)_both]">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-xs font-extrabold tracking-[.08em] uppercase text-[rgba(243,245,249,.6)]">
          <span aria-hidden className="anim-live-pip size-2 rounded-full bg-[#3DCB8B]" />
          Live hand-offs
        </span>
        <span className="mono text-[11.5px] text-[rgba(243,245,249,.55)]">
          step {i + 1}/{STEPS.length}
        </span>
      </div>
      <ul className="mt-[18px] grid grid-cols-3 gap-2.5" aria-label="Agents">
        {SIX.map((id) => {
          const on = active.has(id);
          const [fg, bg] = DARK[id];
          const Icon = AGENT_META[id].icon;
          return (
            <li
              key={id}
              className="flex flex-col gap-[9px] rounded-[18px] border p-3 transition-all duration-[450ms] [transition-timing-function:cubic-bezier(.34,1.45,.64,1)]"
              style={{
                background: on ? bg : "rgba(255,255,255,.04)",
                borderColor: on ? fg : "rgba(255,255,255,.08)",
                transform: on ? "scale(1.04)" : "scale(1)",
                boxShadow: on ? `0 10px 30px ${bg}` : "none",
              }}
            >
              <span className="relative grid size-[38px] place-items-center rounded-xl" style={{ background: bg }}>
                <Icon aria-hidden className="size-[18px]" style={{ color: fg }} strokeWidth={2} />
                {on && <span aria-hidden className="anim-halo absolute -inset-1 rounded-2xl border-2" style={{ borderColor: fg }} />}
              </span>
              <span className="leading-[1.2]">
                <span className="block text-[13.5px] font-extrabold">{AGENT_META[id].name}</span>
                <span className="mt-0.5 block text-[11px] text-[rgba(243,245,249,.6)]">{DOES[id]}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-3.5 min-h-16 rounded-2xl border border-white/8 bg-[rgba(6,13,31,.55)] px-3.5 py-3" aria-live="polite">
        <p className="mono flex items-center gap-2 text-[11px] text-[#FFC65C]">
          {AGENT_META[step.from].name} → {AGENT_META[step.to].name} · {step.type}
        </p>
        <p key={i} className="anim-row-in mt-[5px] text-[13px] leading-[1.45] text-[rgba(243,245,249,.85)]">
          {step.text}
        </p>
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs text-[rgba(243,245,249,.6)]">
        <Hand aria-hidden className="size-[13px] text-[#FFC65C]" />
        Anything risky stops at a human reviewer. Agents can request; only people decide.
      </p>
    </div>
  );
}
