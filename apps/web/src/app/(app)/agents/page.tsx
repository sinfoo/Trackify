import { Bot } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui-kit";

export const metadata = { title: "Agents" };

export default function Page() {
  return (
    <>
      <PageHeader title="Agents" description="The six agents and the orchestrator: status, config and runs." />
      <EmptyState icon={Bot} title="This view is being built" description="Data for this page will appear here." />
    </>
  );
}
