import { Bot } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui-kit";

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6">
      <PageHeader title="Autonomous FinTech Team" description="Six cooperating agents sell, collect payment, guard against fraud and report, with a human in the loop for anything risky." />
      <EmptyState icon={Bot} title="This page is being built" description="Content will appear here." />
    </div>
  );
}
