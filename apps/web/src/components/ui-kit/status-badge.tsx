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

/** Pill tones = Trackify status tokens. `progress` is kept as an alias of `info` for existing callers. */
export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "brand" | "progress";

export const TONE_CLASS: Record<Tone, string> = {
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
  progress: "bg-info-bg text-info",
  neutral: "bg-neutral-bg text-neutral",
  brand: "bg-brand-bg text-brand-text",
};

type StatusDef = { tone: Tone; icon: LucideIcon; label?: string };

// One map for every status in the contract: Transaction, Workflow, Approval, SecurityEvent, Execution, Product, Recommendation.
export const STATUS: Record<string, StatusDef> = {
  // transactions
  CREATED: { tone: "neutral", icon: CircleDot },
  PENDING: { tone: "neutral", icon: Clock },
  PROCESSING: { tone: "info", icon: CircleDashed },
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
  SALES_INTERACTION: { tone: "info", icon: CircleDashed, label: "Sales interaction" },
  CUSTOMER_ANALYSIS: { tone: "info", icon: CircleDashed, label: "Customer analysis" },
  PRODUCT_RECOMMENDATION: { tone: "info", icon: CircleDashed, label: "Product recommendation" },
  ENROLLMENT_REQUEST: { tone: "info", icon: CircleDashed, label: "Enrollment request" },
  SECURITY_CHECK: { tone: "info", icon: CircleDashed, label: "Security check" },
  PAYMENT_SESSION: { tone: "info", icon: CircleDashed, label: "Payment session" },
  PAYMENT_PROCESSING: { tone: "info", icon: CircleDashed, label: "Payment processing" },
  AWAITING_APPROVAL: { tone: "warning", icon: Hand, label: "Awaiting approval" },
  PAYMENT_FAILED: { tone: "danger", icon: CircleX, label: "Payment failed" },
  FINANCIAL_ANALYSIS: { tone: "info", icon: CircleDashed, label: "Financial analysis" },
  BUSINESS_RECOMMENDATION: { tone: "info", icon: CircleDashed, label: "Business recommendation" },
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
  RUNNING: { tone: "info", icon: CircleDashed },
  IDLE: { tone: "neutral", icon: CircleDot },
  DISABLED: { tone: "neutral", icon: Ban },
  // recommendations
  ACCEPTED: { tone: "success", icon: CircleCheck },
  DEFERRED: { tone: "neutral", icon: Clock },
  SUPERSEDED: { tone: "neutral", icon: Ban },
  // customer journey stages (fixtures)
  DECISION: { tone: "brand", icon: CircleDot },
  CONSIDERATION: { tone: "info", icon: CircleDashed },
  ENROLLED: { tone: "success", icon: CircleCheck },
  PAYMENT: { tone: "warning", icon: Clock },
  // priorities
  HIGH: { tone: "warning", icon: TriangleAlert },
  MEDIUM: { tone: "info", icon: Info },
  LOW: { tone: "neutral", icon: Info },
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

export interface BadgeOptions {
  className?: string;
  /** Geist Mono label (message types, codes). */
  mono?: boolean;
  /** Hide the icon. */
  iconless?: boolean;
  /** 20px (sm) / 22px (default) / 26px (lg) */
  size?: "sm" | "default" | "lg";
}

const SIZE = { sm: "h-5 px-2 text-[11px] [&_svg]:size-3", default: "h-[22px] px-2.5 text-xs [&_svg]:size-3.5", lg: "h-[26px] px-3 text-[12.5px] [&_svg]:size-4" };

export function TonePill({
  tone,
  icon: Icon,
  label,
  className,
  mono,
  iconless,
  size = "default",
  weight = 700,
}: BadgeOptions & { tone: Tone; icon?: LucideIcon; label: string; weight?: 600 | 700 | 800 }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full whitespace-nowrap",
        SIZE[size],
        TONE_CLASS[tone],
        mono && "font-mono",
        className,
      )}
      style={{ fontWeight: weight }}
    >
      {Icon && !iconless && <Icon aria-hidden strokeWidth={2.2} />}
      {label}
    </span>
  );
}

/** Icon + text + tone for any contract status. Unknown values render neutral with a humanized label. */
export function StatusBadge({ status, label, ...opts }: BadgeOptions & { status: string; label?: string }) {
  const key = (status ?? "").toUpperCase();
  const def = STATUS[key] ?? { tone: "neutral" as Tone, icon: CircleDot };
  return <TonePill tone={def.tone} icon={def.icon} label={label ?? def.label ?? humanize(key || "Unknown")} {...opts} />;
}

/** LOW info · MEDIUM warning · HIGH danger · CRITICAL danger at weight 600 (prototype). */
export function SeverityBadge({ severity, label, ...opts }: BadgeOptions & { severity: string; label?: string }) {
  const key = (severity ?? "").toUpperCase();
  const def = SEVERITY[key] ?? { tone: "neutral" as Tone, icon: Info };
  return <TonePill tone={def.tone} icon={def.icon} label={label ?? humanize(key || "Unknown")} weight={key === "CRITICAL" ? 600 : 700} {...opts} />;
}
