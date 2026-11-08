import { Bot, Brain, ChartLine, Compass, CreditCard, Mic, Shield, User, UserCheck, Workflow, type LucideIcon } from "lucide-react";
import type { ActorId } from "@/lib/fixtures";
import { cn } from "@/lib/utils";

export interface AgentMeta {
  icon: LucideIcon;
  /** Short name ("Sales"). */
  name: string;
  /** Full name ("Voice Sales Agent"). */
  full: string;
  /** CSS variable names of the agent colour pair, e.g. "--c-sales" / "--c-sales-bg". */
  color: `--c-${ActorId}`;
  colorBg: `--c-${ActorId}-bg`;
}

const meta = (id: ActorId, icon: LucideIcon, name: string, full: string): AgentMeta => ({
  icon,
  name,
  full,
  color: `--c-${id}`,
  colorBg: `--c-${id}-bg`,
});

/**
 * One hue per agent, used everywhere (avatars, canvas nodes, lanes, chat sender names, chips).
 * Typed so `AGENT_META[actorId]` is defined and `AGENT_META[someString]` is `AgentMeta | undefined`.
 */
export const AGENT_META: Record<ActorId, AgentMeta> & Partial<Record<string, AgentMeta>> = {
  sales: meta("sales", Mic, "Sales", "Voice Sales Agent"),
  intelligence: meta("intelligence", Brain, "Intelligence", "Customer Intelligence Agent"),
  payment: meta("payment", CreditCard, "Payment", "Payment Agent"),
  analyst: meta("analyst", ChartLine, "Analyst", "Financial Data Analyst"),
  strategy: meta("strategy", Compass, "Strategy", "Business Strategy Agent"),
  security: meta("security", Shield, "Security", "Security & Fraud Agent"),
  orchestrator: meta("orchestrator", Workflow, "Orchestrator", "Orchestrator"),
  human: meta("human", UserCheck, "Human approver", "Human approver"),
  customer: meta("customer", User, "Customer", "Customer"),
};

const FALLBACK: AgentMeta = { icon: Bot, name: "Agent", full: "Agent", color: "--c-orchestrator", colorBg: "--c-orchestrator-bg" };

export function agentMeta(id: string): AgentMeta {
  return (AGENT_META as Record<string, AgentMeta>)[id] ?? { ...FALLBACK, name: id, full: id };
}

/** Inline style pair for an agent tile: coloured icon on its tinted background. */
export function agentColors(id: string) {
  const m = agentMeta(id);
  return { color: `var(${m.color})`, background: `var(${m.colorBg})` };
}

export type AgentAvatarSize = 24 | 28 | 32 | 40 | 44 | 56 | "sm" | "md" | "lg";
const ALIAS: Record<"sm" | "md" | "lg", 24 | 28 | 32 | 40 | 44 | 56> = { sm: 28, md: 32, lg: 44 };
/** tile px -> [radius px, icon px] (README: avatars 11-14px radius) */
const SPEC: Record<number, [number, number]> = {
  24: [8, 13],
  28: [9, 14],
  32: [10, 15],
  40: [13, 19],
  44: [14, 19],
  56: [16, 24],
};

/**
 * Coloured agent tile. Sizes 24/28/32/40/44/56 (aliases sm=28, md=32, lg=44).
 * `halo` adds the pulsing active ring (canvas nodes).
 */
export function AgentAvatar({
  agentId,
  size = 32,
  showName = false,
  halo = false,
  className,
}: {
  agentId: string;
  size?: AgentAvatarSize;
  showName?: boolean;
  halo?: boolean;
  className?: string;
}) {
  const m = agentMeta(agentId);
  const px = typeof size === "number" ? size : ALIAS[size];
  const [radius, icon] = SPEC[px] ?? [Math.round(px * 0.3), Math.round(px * 0.45)];
  const Icon = m.icon;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        role="img"
        aria-label={m.name}
        className="relative inline-flex shrink-0 items-center justify-center"
        style={{ width: px, height: px, borderRadius: radius, ...agentColors(agentId) }}
      >
        <Icon aria-hidden style={{ width: icon, height: icon }} strokeWidth={2} />
        {halo && (
          <span
            aria-hidden
            className="anim-halo pointer-events-none absolute -inset-1 border-2"
            style={{ borderRadius: radius + 4, borderColor: `var(${m.color})` }}
          />
        )}
      </span>
      {showName && <span className="text-sm font-semibold">{m.name}</span>}
    </span>
  );
}
