"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/shell/logo";
import { AGENT_META } from "@/components/ui-kit";
import { AGENT_IDS } from "@/lib/fixtures";
import { STEP_MS } from "@/features/agents/scenario-clock";

/**
 * Auth brand panel (prototype "AUTH" block): always-dark gradient, amber glow, masked dot grid, lock-up,
 * headline, and the six-agent relay grid where the live tile pops in turn. `dark` on the section scopes the
 * agent colour tokens to their dark values in both themes.
 */
export function BrandPanel() {
  // ponytail: the prototype drives this from the scenario clock; the clock provider needs the SSE
  // EventsProvider (authenticated), so cycle the six tiles on the same 1.9s beat instead.
  const [live, setLive] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setLive((i) => (i + 1) % AGENT_IDS.length), STEP_MS);
    return () => clearInterval(t);
  }, []);

  return (
    <section
      className="dark relative flex min-w-0 flex-[1_1_460px] flex-col justify-between overflow-hidden px-12 py-10 text-[#F3F5F9]"
      style={{ background: "linear-gradient(160deg,#0E1C3E 0%,#0A1530 50%,#0B1A3A 100%)" }}
      aria-label="Trackify"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[260px] -left-[200px] size-[700px] rounded-full"
        style={{ background: "radial-gradient(circle,rgba(245,166,35,.26),rgba(245,166,35,0) 68%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,.08) 1px,transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(ellipse at 50% 60%,#000 20%,transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 60%,#000 20%,transparent 75%)",
        }}
      />

      <Link href="/" aria-label="Trackify, home" className="relative flex w-max items-center gap-3 text-inherit no-underline hover:no-underline">
        <Image
          src="/brand/trackify-mark.png"
          alt=""
          width={40}
          height={40}
          priority
          className="size-10 shrink-0 rounded-xl shadow-[0_6px_18px_rgba(245,166,35,.25)]"
        />
        <span className="leading-[1.15]">
          <Wordmark className="block text-base" />
          <span className="block text-xs text-[rgba(243,245,249,.6)]">Autonomous FinTech Team</span>
        </span>
      </Link>

      <div className="relative my-12 max-w-[520px]">
        <p className="text-xs font-extrabold tracking-[.08em] uppercase text-[#FFC65C]">Operations console</p>
        <h1 className="mt-2.5 text-[clamp(32px,3.6vw,46px)] leading-[1.05] font-extrabold tracking-[-0.035em]">Six agents do the work. You decide what matters.</h1>
        <p className="mt-4 text-base leading-[1.55] text-[rgba(243,245,249,.7)]">
          Watch every hand-off live, release or reject held payments, and keep the whole journey traceable.
        </p>
        <ul className="mt-7 grid grid-cols-3 gap-2.5" aria-label="Agents">
          {AGENT_IDS.map((id, i) => {
            const m = AGENT_META[id];
            const Icon = m.icon;
            const on = i === live;
            return (
              <li
                key={id}
                className="flex items-center gap-[9px] rounded-2xl border p-2.5 transition-all duration-[450ms] [transition-timing-function:cubic-bezier(.34,1.45,.64,1)]"
                style={{
                  background: on ? `var(${m.colorBg})` : "rgba(255,255,255,.05)",
                  borderColor: on ? `var(${m.color})` : "rgba(255,255,255,.08)",
                  transform: `scale(${on ? 1.05 : 1})`,
                }}
              >
                <span className="grid size-[30px] shrink-0 place-items-center rounded-[10px]" style={{ background: `var(${m.colorBg})`, color: `var(${m.color})` }}>
                  <Icon aria-hidden className="size-3.5" strokeWidth={2.2} />
                </span>
                <span className="text-[12.5px] font-extrabold">{m.name}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="relative text-[12.5px] text-[rgba(243,245,249,.5)]">Fictional demo data. Payments are simulated; no real money moves.</p>
    </section>
  );
}
