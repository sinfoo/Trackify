import { ArrowDown, ArrowRight, Hand, User } from "lucide-react";
import { AgentAvatar } from "@/components/ui-kit";

// Hallmark · macrostructure: Map / Diagram · tone: technical, sober · anchor hue: TECHX orange on navy (DESIGN.md tokens)
// The six agents drawn as the relay they actually run, not as a card grid. Navy panel in both themes, like the app sidebar.

type Node = { id: string; name: string; does: string; hands: string };

const CONVERSATION: Node[] = [
  { id: "security", name: "Security", does: "Screens every message for prompt injection before anyone answers it.", hands: "clean message" },
  { id: "sales", name: "Sales", does: "Answers questions, recommends a program, offers to enroll you.", hands: "transcript" },
  { id: "intelligence", name: "Intelligence", does: "Reads intent, objections and sentiment from the conversation.", hands: "enrollment" },
];
const MONEY: Node[] = [
  { id: "payment", name: "Payment", does: "Runs the simulated checkout after a second security check.", hands: "settled payment" },
  { id: "analyst", name: "Analyst", does: "Recomputes revenue, conversion and anomalies.", hands: "fresh numbers" },
  { id: "strategy", name: "Strategy", does: "Turns the numbers into business recommendations for the team.", hands: "" },
];

function Lane({ title, nodes, start }: { title: string; nodes: Node[]; start: number }) {
  return (
    <div>
      <h3 className="mb-4 text-sm font-medium text-sidebar-muted">{title}</h3>
      <ol className="grid gap-0 md:grid-cols-3">
        {nodes.map((n, i) => (
          <li key={n.id} className="relative flex gap-4 pb-8 md:flex-col md:gap-3 md:pr-8 md:pb-0">
            <div className="flex flex-col items-center md:flex-row md:items-center">
              <AgentAvatar agentId={n.id} size="lg" className="[&>span]:bg-midnight [&>span]:ring-1 [&>span]:ring-sidebar-border" />
              {/* connector: vertical on mobile, horizontal on md+ */}
              {(i < nodes.length - 1 || n.hands) && (
                <span aria-hidden className="mt-2 w-px flex-1 bg-primary/50 md:mt-0 md:ml-3 md:h-px md:w-auto md:flex-1" />
              )}
            </div>
            <div className="min-w-0 pb-1">
              <p className="flex items-baseline gap-2">
                <span className="num text-sm text-primary">{String(start + i).padStart(2, "0")}</span>
                <span className="text-lg font-semibold text-sidebar-accent-foreground">{n.name}</span>
              </p>
              <p className="mt-1 text-sm text-sidebar-foreground/85">{n.does}</p>
              {n.hands && (
                <p className="num mt-2 inline-flex items-center gap-1 text-xs text-sidebar-muted">
                  passes on: {n.hands}
                  <ArrowRight aria-hidden className="hidden size-3 md:inline" />
                  <ArrowDown aria-hidden className="size-3 md:hidden" />
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function AgentRelay() {
  return (
    <figure className="rounded-2xl bg-navy p-5 text-sidebar-foreground ring-1 ring-sidebar-border md:p-8">
      <figcaption className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="inline-flex items-center gap-2 rounded-full bg-midnight px-3 py-1.5 text-sm text-sidebar-accent-foreground ring-1 ring-sidebar-border">
          <User aria-hidden className="size-4 text-primary" /> You ask a question
        </span>
        <span className="text-sm text-sidebar-muted">Six agents pick it up in this order. An orchestrator keeps the hand-offs honest.</span>
      </figcaption>
      <div className="grid gap-10">
        <Lane title="While you talk" nodes={CONVERSATION} start={1} />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
          <Lane title="When you enroll" nodes={MONEY} start={4} />
          <div className="rounded-xl border border-dashed border-warning/60 p-4">
            <p className="flex items-center gap-2 font-semibold text-sidebar-accent-foreground">
              <Hand aria-hidden className="size-5 text-warning" /> A person, not an agent
            </p>
            <p className="mt-1.5 text-sm text-sidebar-foreground/85">
              Anything risky stops here. Held payments and every refund wait for a human reviewer to approve or reject.
            </p>
          </div>
        </div>
      </div>
    </figure>
  );
}
