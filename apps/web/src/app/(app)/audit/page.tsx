import { ScrollText } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui-kit";

export const metadata = { title: "Audit" };

export default function Page() {
  return (
    <>
      <PageHeader title="Audit" description="Tamper-evident log of every action." />
      <EmptyState icon={ScrollText} title="This view is being built" description="Data for this page will appear here." />
    </>
  );
}
