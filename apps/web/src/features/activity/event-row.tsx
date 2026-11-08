import Link from "next/link";
import { Activity } from "lucide-react";
import { agentColors, agentMeta, STATUS, Tile, TonePill } from "@/components/ui-kit";
import { formatDateTime } from "@/lib/format";
import type { AppEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

export const EVENT_GROUPS = ["agents", "workflows", "payments", "security", "approvals", "customers", "analytics"] as const;
export type EventGroup = (typeof EVENT_GROUPS)[number];

const PREFIX: Record<string, EventGroup> = {
  agent: "agents",
  workflow: "workflows",
  payment: "payments",
  security: "security",
  approval: "approvals",
  customer: "customers",
  analytics: "analytics",
};
export const eventGroup = (type: string): EventGroup | undefined => PREFIX[type.split(".")[0]];

// Map event types onto existing StatusBadge statuses so tone + icon stay consistent app-wide.
const TYPE_STATUS: Record<string, string> = {
  "agent.started": "RUNNING",
  "agent.completed": "SUCCEEDED",
  "agent.failed": "FAILED",
  "workflow.started": "NEW_CUSTOMER",
  "workflow.completed": "COMPLETED",
  "security.alert": "OPEN",
  "approval.requested": "PENDING_REVIEW",
  "approval.resolved": "RESOLVED",
};

/** Prototype feed type pill: mono 10.5/600, tone of the mapped status. */
export function EventTypeBadge({ type }: { type: string }) {
  const def = STATUS[TYPE_STATUS[type] ?? "CREATED"];
  return <TonePill tone={def.tone} icon={def.icon} label={type} mono weight={600} className="text-[10.5px] [&_svg]:size-[11px]" />;
}

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Feed row: grid 70px 30px 1fr auto, padding 11px 18px, hairline top; `fresh` rows animate rowIn. */
export function EventRow({ e, fresh, large }: { e: AppEvent; fresh?: boolean; large?: boolean }) {
  return (
    <li
      className={cn(
        "grid grid-cols-[auto_30px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 border-t border-hair px-[18px] py-[11px] sm:grid-cols-[70px_30px_minmax(0,1fr)_auto]",
        fresh && "anim-row-in",
      )}
    >
      <time dateTime={e.created_at} title={formatDateTime(e.created_at)} className="num text-xs text-t3" suppressHydrationWarning>
        {timeFmt.format(new Date(e.created_at))}
      </time>
      {e.agent_id ? (
        <Tile icon={agentMeta(e.agent_id).icon} size={30} radius={10} iconSize={14} {...agentColors(e.agent_id)} />
      ) : (
        <Tile icon={Activity} size={30} radius={10} iconSize={14} tone="neutral" />
      )}
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <EventTypeBadge type={e.type} />
        <span className={cn("min-w-0 break-words", large ? "text-[15px]" : "text-[13.5px]")}>{e.summary}</span>
      </span>
      {e.workflow_id ? (
        <Link href={`/workflows/${e.workflow_id}`} className="col-start-3 text-[12.5px] font-bold whitespace-nowrap sm:col-start-auto">
          Workflow →
        </Link>
      ) : (
        <span className="hidden sm:block" />
      )}
    </li>
  );
}
