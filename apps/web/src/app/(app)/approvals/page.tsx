import { ClipboardCheck } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui-kit";

export const metadata = { title: "Approvals" };

export default function Page() {
  return (
    <>
      <PageHeader title="Approvals" description="Actions held for a human decision." />
      <EmptyState icon={ClipboardCheck} title="This view is being built" description="Data for this page will appear here." />
    </>
  );
}
