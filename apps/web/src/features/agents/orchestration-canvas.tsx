"use client";

import Link from "next/link";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Activity, ArrowRight, Pause, Play } from "lucide-react";
import { agentColors, agentMeta, Eyebrow } from "@/components/ui-kit";
import { SCENARIO_IDS, SCENARIOS, type ActorId } from "@/lib/fixtures";
import { cn } from "@/lib/utils";
import { useScenarioClock, type Handoff } from "./scenario-clock";

// ---- Geometry (prototype Trackify.dc.html: POS / curve / EDGES / pathFor on a 1000x560 viewBox) ----
export const POS: Record<ActorId, [number, number]> = {
  customer: [17, 13],
  orchestrator: [50, 50],
  sales: [24, 36],
  intelligence: [50, 12],
  strategy: [76, 36],
  security: [24, 72],
  analyst: [76, 72],
  payment: [50, 86],
  human: [83, 90],
};
const NODE_IDS = Object.keys(POS) as ActorId[];
const px = (id: ActorId): [number, number] => [POS[id][0] * 10, POS[id][1] * 5.6];
const curve = (a: ActorId, b: ActorId) => {
  const [x1, y1] = px(a);
  const [x2, y2] = px(b);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const n = Math.hypot(dx, dy) || 1;
  const k = 0.12 * n;
  return `M${x1},${y1} Q${mx - (dy / n) * k},${my + (dx / n) * k} ${x2},${y2}`;
};
export const EDGES: [ActorId, ActorId][] = [
  ["customer", "orchestrator"],
  ["orchestrator", "security"],
  ["orchestrator", "sales"],
  ["sales", "intelligence"],
  ["intelligence", "strategy"],
  ["orchestrator", "payment"],
  ["payment", "security"],
  ["payment", "analyst"],
  ["analyst", "strategy"],
  ["payment", "human"],
  ["orchestrator", "analyst"],
  ["orchestrator", "human"],
  ["payment", "sales"],
  ["strategy", "orchestrator"],
];
const edgeKey = (a: ActorId, b: ActorId) => EDGES.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
/** Path from `a` to `b` following the drawn edge's curvature (reversed when the edge is stored b->a). */
const pathFor = (a: ActorId, b: ActorId) => {
  const i = edgeKey(a, b);
  if (i < 0) return curve(a, b);
  const fwd = EDGES[i][0] === a;
  const d = curve(fwd ? a : b, fwd ? b : a);
  if (fwd) return d;
  const m = d.match(/M([\d.]+),([\d.]+) Q([\d.]+),([\d.]+) ([\d.]+),([\d.]+)/);
  return m ? `M${m[5]},${m[6]} Q${m[3]},${m[4]} ${m[1]},${m[2]}` : d;
};

const NODE_HREF: Partial<Record<ActorId, string>> = { customer: "/studio", human: "/approvals" };
const NODE_SUB: Partial<Record<ActorId, string>> = { customer: "Yasmine · assistant", human: "finance@demo.techx" };

/**
 * Orchestration canvas (README §1.2): 9 positioned nodes, curved SVG edges, travelling packet,
 * scenario segmented control, play/pause and the pinned step bar. Driven by the shared scenario clock.
 * `compact` hides the scenario tabs (Agents page); `linkNodes=false` renders nodes as plain cards.
 */
export function OrchestrationCanvas({ compact = false, linkNodes = true, className }: { compact?: boolean; linkNodes?: boolean; className?: string }) {
  const clock = useScenarioClock();
  const { scenario, steps, step, total, current: cur, playing } = clock;
  const activeIds = new Set<ActorId>([cur.from, cur.to]);
  const hot = `var(--c-${cur.to})`;
  const activeEdge = edgeKey(cur.from, cur.to);
  const visited = new Set(steps.slice(0, step).map((s) => edgeKey(s.from, s.to)));
  const packetPath = pathFor(cur.from, cur.to);

  // Restart the packet on every step change (prototype: motionEls.forEach(el => el.beginElement())).
  const motion = useRef<SVGAnimateMotionElement>(null);
  useEffect(() => {
    try {
      motion.current?.beginElement();
    } catch {
      /* SVG SMIL unsupported: the packet simply stays at the path start */
    }
  }, [packetPath, step]);

  const PlayIcon = playing ? Pause : Play;

  return (
    <div className={cn("relative flex min-w-0 flex-col overflow-hidden rounded-[26px] border border-hair bg-panel shadow-card", className)}>
      <div className="relative z-2 flex flex-wrap items-center gap-3 px-[22px] pt-[18px]">
        <div className="min-w-[220px] flex-1">
          <Eyebrow>The team at work</Eyebrow>
          <h2 className="mt-0.5 text-[19px] font-extrabold tracking-[-0.015em]">{SCENARIOS[scenario].title}</h2>
        </div>
        {!compact && (
          <div role="tablist" aria-label="Scenario" className="inline-flex max-w-full overflow-x-auto rounded-full border border-hair bg-panel2 p-[3px]">
            {SCENARIO_IDS.map((k) => {
              const on = scenario === k;
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => clock.setScenario(k)}
                  className={cn(
                    "h-[30px] rounded-full px-3 text-[12.5px] font-bold transition-colors duration-250",
                    on ? "bg-text text-bg" : "bg-transparent text-t2 hover:text-text",
                  )}
                >
                  {SCENARIOS[k].short}
                </button>
              );
            })}
          </div>
        )}
        <button
          type="button"
          onClick={clock.toggle}
          aria-label={playing ? "Pause scenario" : "Play scenario"}
          aria-pressed={playing}
          className="grid size-9 place-items-center rounded-full bg-brand text-on-brand transition-transform duration-200 hover:scale-[1.06]"
          style={{ boxShadow: "0 6px 18px rgba(245,166,35,.35)" }}
        >
          <PlayIcon aria-hidden className="size-[15px]" strokeWidth={2.4} />
        </button>
      </div>

      <div className="relative mt-1.5 max-h-[640px] min-h-[420px] flex-none" style={{ aspectRatio: "1000 / 640" }}>
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(var(--grid-dot) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
            maskImage: "radial-gradient(ellipse at center, #000 55%, transparent 95%)",
            WebkitMaskImage: "radial-gradient(ellipse at center, #000 55%, transparent 95%)",
          }}
        />
        <svg viewBox="0 0 1000 560" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          {EDGES.slice(0, 10).map(([a, b], i) => {
            const on = i === activeEdge;
            const seen = visited.has(i);
            return (
              <path
                key={`${a}-${b}`}
                d={curve(a, b)}
                fill="none"
                stroke={on ? hot : seen ? "var(--t4)" : "var(--hair2)"}
                strokeWidth={on ? 2.5 : 1.25}
                strokeLinecap="round"
                strokeDasharray={on ? "6 6" : "0"}
                vectorEffect="non-scaling-stroke"
                className={cn("transition-[stroke,stroke-width] duration-400", on && "anim-dash")}
                style={on ? { animationDuration: ".6s" } : undefined}
              />
            );
          })}
          <g className="transition-opacity duration-200" style={{ opacity: 1 }}>
            <circle r="7" fill={hot} style={{ filter: `drop-shadow(0 0 10px ${hot})` }}>
              <animateMotion ref={motion} dur="1.1s" begin="indefinite" fill="freeze" calcMode="spline" keySplines=".3 0 .2 1" keyTimes="0;1" path={packetPath} />
            </circle>
          </g>
        </svg>

        {NODE_IDS.map((id) => {
          const m = agentMeta(id);
          const { color: fg, background: tile } = agentColors(id);
          const active = activeIds.has(id);
          const target = cur.to === id;
          const Icon = m.icon;
          const style: CSSProperties = {
            left: `${POS[id][0]}%`,
            top: `${POS[id][1]}%`,
            width: id === "orchestrator" ? "24%" : "22%",
            transform: `translate(-50%,-50%) scale(${active ? 1.05 : 1})`,
            background: active ? "var(--node-on)" : "var(--node)",
            borderColor: active ? fg : "var(--hair2)",
            boxShadow: active ? `0 12px 40px ${tile}, 0 0 0 4px ${tile}` : "var(--shadow)",
            padding: "clamp(7px,1.2vw,12px) clamp(8px,1.3vw,14px)",
            gap: "clamp(7px,1.1vw,12px)",
            transition: "transform .5s cubic-bezier(.34,1.45,.64,1), box-shadow .4s, border-color .4s",
          };
          const body = (
            <>
              <span className="relative grid flex-none place-items-center rounded-[14px]" style={{ width: "clamp(32px,3.6vw,44px)", height: "clamp(32px,3.6vw,44px)", background: tile, color: fg }}>
                <Icon aria-hidden className="size-[19px]" strokeWidth={2} />
                {active && <span aria-hidden className="anim-halo absolute -inset-1 rounded-[18px] border-2" style={{ borderColor: fg }} />}
              </span>
              <span className="min-w-0 leading-[1.2]">
                <span className="block font-extrabold tracking-[-0.01em]" style={{ fontSize: "clamp(12px,1.15vw,14.5px)" }}>
                  {m.name}
                </span>
                <span className={cn("mt-[3px] block truncate text-[11.5px]", target ? "font-mono" : "text-t3")} style={target ? { color: fg } : undefined}>
                  {target ? cur.type : (NODE_SUB[id] ?? m.full)}
                </span>
              </span>
            </>
          );
          const cls = "absolute flex min-w-0 items-center rounded-[20px] border text-text no-underline backdrop-blur-[8px] hover:no-underline";
          const label = `${m.name}${active ? " (active)" : ""}`;
          return linkNodes ? (
            <Link key={id} href={NODE_HREF[id] ?? `/agents/${id}`} className={cls} style={style} aria-label={label} data-active={active || undefined}>
              {body}
            </Link>
          ) : (
            <div key={id} className={cls} style={style} aria-label={label} data-active={active || undefined}>
              {body}
            </div>
          );
        })}
      </div>

      <div className="relative z-2 mt-auto flex items-center gap-3.5 border-t border-hair bg-panel2 px-[22px] pt-3.5 pb-[18px]">
        <span className="tabular text-xs font-bold whitespace-nowrap text-t3">
          Step {step + 1} / {total}
        </span>
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-panel3" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step + 1} aria-label="Scenario progress">
          <span
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-[cubic-bezier(.2,.8,.2,1)]"
            style={{ width: `${(((step + 1) / total) * 100).toFixed(1)}%`, background: "linear-gradient(90deg,#F5A623,#FFC65C)" }}
          />
        </div>
        <span className="max-w-[46%] truncate text-[13px] font-semibold text-t2" aria-live="polite">
          {cur.caption}
        </span>
      </div>
    </div>
  );
}

/** One hand-off row: sender tile → receiver tile, mono type, text. Danger rows (HOLD / REJECTED / alert) get the danger fill. */
export function HandoffRow({ h, className }: { h: Handoff; className?: string }) {
  const F = agentMeta(h.from).icon;
  const T = agentMeta(h.to).icon;
  return (
    <li
      className={cn("anim-row-in rounded-2xl border px-3 py-2.5", h.danger ? "border-danger bg-danger-bg" : "border-hair bg-panel2", className)}
      style={{ animationDuration: ".4s" }}
    >
      <div className="flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-lg" style={agentColors(h.from)} title={agentMeta(h.from).name}>
          <F aria-hidden className="size-[13px]" strokeWidth={2.2} />
        </span>
        <ArrowRight aria-hidden className="size-[13px] text-t4" />
        <span className="grid size-6 place-items-center rounded-lg" style={agentColors(h.to)} title={agentMeta(h.to).name}>
          <T aria-hidden className="size-[13px]" strokeWidth={2.2} />
        </span>
        <span className="ml-auto rounded-md bg-panel2 px-[7px] py-0.5 font-mono text-[10.5px] text-t3">{h.type}</span>
      </div>
      <p className="mt-2 text-[13px] leading-[1.4] text-t2">{h.text}</p>
    </li>
  );
}

/** Hand-offs aside (README §1.2): eyebrow, "Agent messages", last 8 hand-offs newest first, footer links. */
export function HandoffsPanel({ className, footer }: { className?: string; footer?: ReactNode }) {
  const { thread } = useScenarioClock();
  return (
    <aside className={cn("flex min-w-0 max-h-[780px] flex-col overflow-hidden rounded-[26px] border border-hair bg-panel shadow-card", className)} aria-label="Hand-offs">
      <div className="border-b border-hair px-5 pt-[18px] pb-3">
        <Eyebrow>Hand-offs</Eyebrow>
        <h2 className="mt-0.5 text-[17px] font-extrabold tracking-[-0.01em]">Agent messages</h2>
      </div>
      <ol className="flex flex-1 flex-col gap-2.5 overflow-hidden px-4 py-3.5" aria-live="polite">
        {thread.map((h) => (
          <HandoffRow key={h.id} h={h} />
        ))}
      </ol>
      <div className="flex gap-2 border-t border-hair px-4 pt-3 pb-4">
        {footer ?? (
          <>
            <Link href="/workflows" className="inline-flex h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-hair bg-panel2 text-[13px] font-bold text-text no-underline hover:bg-panel3 hover:no-underline">
              Open workflow <ArrowRight aria-hidden className="size-3.5" />
            </Link>
            <Link href="/activity" className="inline-flex h-[38px] items-center justify-center gap-1.5 rounded-xl border border-hair bg-panel2 px-3.5 text-[13px] font-bold text-text no-underline hover:bg-panel3 hover:no-underline">
              <Activity aria-hidden className="size-3.5" /> Live feed
            </Link>
          </>
        )}
      </div>
    </aside>
  );
}
