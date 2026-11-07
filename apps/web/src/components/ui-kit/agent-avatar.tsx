import { Bot, Brain, Compass, CreditCard, LineChart, Mic, Shield, Workflow, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const AGENT_META: Record<string, { icon: LucideIcon; name: string }> = {
  sales: { icon: Mic, name: "Sales" },
  intelligence: { icon: Brain, name: "Intelligence" },
  payment: { icon: CreditCard, name: "Payment" },
  analyst: { icon: LineChart, name: "Analyst" },
  strategy: { icon: Compass, name: "Strategy" },
  security: { icon: Shield, name: "Security" },
  orchestrator: { icon: Workflow, name: "Orchestrator" },
};

const SIZES = { sm: "size-7 [&_svg]:size-3.5", md: "size-9 [&_svg]:size-4.5", lg: "size-12 [&_svg]:size-6" };

export function AgentAvatar({
  agentId,
  size = "md",
  showName = false,
  className,
}: {
  agentId: string;
  size?: keyof typeof SIZES;
  showName?: boolean;
  className?: string;
}) {
  const meta = AGENT_META[agentId] ?? { icon: Bot, name: agentId };
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        role="img"
        aria-label={`${meta.name} agent`}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-lg bg-navy text-primary dark:bg-secondary",
          SIZES[size],
        )}
      >
        <Icon aria-hidden />
      </span>
      {showName && <span className="text-sm font-medium">{meta.name}</span>}
    </span>
  );
}
