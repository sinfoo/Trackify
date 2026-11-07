import {
  Ban,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleHelp,
  CircleX,
  Clock,
  Hand,
  Info,
  OctagonAlert,
  RotateCcw,
  ShieldAlert,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "progress";

const TONE_CLASS: Record<Tone, string> = {
  success: "bg-success/12 text-success-text border-success/25",
  warning: "bg-warning/15 text-warning-text border-warning/30",
  danger: "bg-danger/12 text-danger-text border-danger/25",
  info: "bg-info/10 text-info-text border-info/25",
  progress: "bg-info/10 text-info-text border-info/25",
  neutral: "bg-muted text-muted-foreground border-border",
};

type StatusDef = { tone: Tone; icon: LucideIcon; label?: string };

// One map for every status in the contract: Transaction, Workflow, Approval, SecurityEvent, Execution.
const STATUS: Record<string, StatusDef> = {
  // transactions
  CREATED: { tone: "neutral", icon: CircleDot },
  PENDING: { tone: "neutral", icon: Clock },
  PROCESSING: { tone: "progress", icon: CircleDashed },
  SUCCEEDED: { tone: "success", icon: CircleCheck },
  FAILED: { tone: "danger", icon: CircleX },
  REQUIRES_APPROVAL: { tone: "warning", icon: Hand, label: "Requires approval" },
  CANCELLED: { tone: "neutral", icon: Ban },
  REFUNDED: { tone: "info", icon: RotateCcw },
  BLOCKED: { tone: "danger", icon: ShieldAlert },
  // orders / enrollments / products
  PENDING_PAYMENT: { tone: "warning", icon: Clock, label: "Pending payment" },
  PAID: { tone: "success", icon: CircleCheck },
  ACTIVE: { tone: "success", icon: CircleCheck },
  DRAFT: { tone: "neutral", icon: CircleDashed },
  ARCHIVED: { tone: "neutral", icon: Ban },
  // workflows
  NEW_CUSTOMER: { tone: "info", icon: CircleDot, label: "New customer" },
  SALES_INTERACTION: { tone: "progress", icon: CircleDashed, label: "Sales interaction" },
  CUSTOMER_ANALYSIS: { tone: "progress", icon: CircleDashed, label: "Customer analysis" },
  PRODUCT_RECOMMENDATION: { tone: "progress", icon: CircleDashed, label: "Product recommendation" },
  ENROLLMENT_REQUEST: { tone: "progress", icon: CircleDashed, label: "Enrollment request" },
  SECURITY_CHECK: { tone: "progress", icon: CircleDashed, label: "Security check" },
  PAYMENT_SESSION: { tone: "progress", icon: CircleDashed, label: "Payment session" },
  PAYMENT_PROCESSING: { tone: "progress", icon: CircleDashed, label: "Payment processing" },
  AWAITING_APPROVAL: { tone: "warning", icon: Hand, label: "Awaiting approval" },
  PAYMENT_FAILED: { tone: "danger", icon: CircleX, label: "Payment failed" },
  FINANCIAL_ANALYSIS: { tone: "progress", icon: CircleDashed, label: "Financial analysis" },
  BUSINESS_RECOMMENDATION: { tone: "progress", icon: CircleDashed, label: "Business recommendation" },
  COMPLETED: { tone: "success", icon: CircleCheck },
  LOW_INTENT: { tone: "neutral", icon: CircleDot, label: "Low intent" },
  ERROR: { tone: "danger", icon: OctagonAlert },
  // approvals
  PENDING_REVIEW: { tone: "warning", icon: Clock, label: "Pending review" },
  APPROVED: { tone: "success", icon: CircleCheck },
  REJECTED: { tone: "danger", icon: CircleX },
  INFORMATION_REQUESTED: { tone: "info", icon: CircleHelp, label: "Info requested" },
  INFO_REQUESTED: { tone: "info", icon: CircleHelp, label: "Info requested" },
  EXPIRED: { tone: "neutral", icon: Clock },
  // security events
  OPEN: { tone: "danger", icon: TriangleAlert },
  INVESTIGATING: { tone: "warning", icon: CircleDashed },
  RESOLVED: { tone: "success", icon: CircleCheck },
  DISMISSED: { tone: "neutral", icon: Ban },
  // executions / agents
  RUNNING: { tone: "progress", icon: CircleDashed },
  IDLE: { tone: "neutral", icon: CircleDot },
  DISABLED: { tone: "neutral", icon: Ban },
  // recommendations
  ACCEPTED: { tone: "success", icon: CircleCheck },
  DEFERRED: { tone: "neutral", icon: Clock },
};

const SEVERITY: Record<string, StatusDef> = {
  LOW: { tone: "info", icon: Info },
  MEDIUM: { tone: "warning", icon: TriangleAlert },
  HIGH: { tone: "danger", icon: OctagonAlert },
  CRITICAL: { tone: "danger", icon: ShieldAlert },
};

export const humanize = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

export function statusTone(status: string): Tone {
  return STATUS[status?.toUpperCase()]?.tone ?? "neutral";
}

function Pill({ def, label, className, strong }: { def: StatusDef; label: string; className?: string; strong?: boolean }) {
  const Icon = def.icon;
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASS[def.tone],
        strong && "font-semibold",
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {label}
    </span>
  );
}

/** Icon + text + tone for any contract status. Unknown values render neutral with a humanized label. */
export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  const key = (status ?? "").toUpperCase();
  const def = STATUS[key] ?? { tone: "neutral" as Tone, icon: CircleDot };
  return <Pill def={def} label={label ?? def.label ?? humanize(key || "Unknown")} className={className} />;
}

export function SeverityBadge({ severity, label, className }: { severity: string; label?: string; className?: string }) {
  const key = (severity ?? "").toUpperCase();
  const def = SEVERITY[key] ?? { tone: "neutral" as Tone, icon: Info };
  return <Pill def={def} label={label ?? humanize(key || "Unknown")} className={className} strong={key === "CRITICAL"} />;
}
