import { BarChart3 } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui-kit";

export const metadata = { title: "Analytics" };

export default function Page() {
  return (
    <>
      <PageHeader title="Analytics" description="Revenue, conversion, customers and agent performance." />
      <EmptyState icon={BarChart3} title="This view is being built" description="Data for this page will appear here." />
    </>
  );
}
