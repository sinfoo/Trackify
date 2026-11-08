import Link from "next/link";
import { Activity } from "lucide-react";
import { AgentAvatar, StatusBadge } from "@/components/ui-kit";
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

export function EventTypeBadge({ type }: { type: string }) {
  return <StatusBadge status={TYPE_STATUS[type] ?? "CREATED"} label={type} className="num" />;
}

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function EventRow({ e, fresh, large }: { e: AppEvent; fresh?: boolean; large?: boolean }) {
  return (
    <li
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[72px_auto_minmax(0,1fr)_auto] sm:items-center",
        fresh && "animate-in duration-300 ease-out fade-in-0 slide-in-from-top-1",
      )}
    >
      <time
        dateTime={e.created_at}
        title={formatDateTime(e.created_at)}
        className="num col-span-2 text-xs text-muted-foreground sm:col-span-1"
        suppressHydrationWarning
      >
        {timeFmt.format(new Date(e.created_at))}
      </time>
      {e.agent_id ? (
        <AgentAvatar agentId={e.agent_id} size="sm" />
      ) : (
        <span aria-label="System" role="img" className="inline-flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Activity aria-hidden className="size-3.5" />
        </span>
      )}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <EventTypeBadge type={e.type} />
        <span className={cn("min-w-0 break-words", large ? "text-base" : "text-sm")}>{e.summary}</span>
      </div>
      {e.workflow_id ? (
        <Link
          href={`/workflows/${e.workflow_id}`}
          className="col-start-2 text-sm text-info-text underline-offset-4 hover:underline sm:col-start-auto"
        >
          Workflow
        </Link>
      ) : (
        <span className="hidden sm:block" />
      )}
    </li>
  );
}
