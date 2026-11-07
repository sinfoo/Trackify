import { GitBranch } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui-kit";

export const metadata = { title: "Workflows" };

export default function Page() {
  return (
    <>
      <PageHeader title="Workflows" description="Customer journeys and their current state." />
      <EmptyState icon={GitBranch} title="This view is being built" description="Data for this page will appear here." />
    </>
  );
}
