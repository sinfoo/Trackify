import { Compass } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui-kit";

export const metadata = { title: "Strategy" };

export default function Page() {
  return (
    <>
      <PageHeader title="Strategy" description="Business recommendations from the strategy agent." />
      <EmptyState icon={Compass} title="This view is being built" description="Data for this page will appear here." />
    </>
  );
}
