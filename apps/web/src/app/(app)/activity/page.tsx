import { Activity } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui-kit";

export const metadata = { title: "Live activity" };

export default function Page() {
  return (
    <>
      <PageHeader title="Live activity" description="Every agent action as it happens." />
      <EmptyState icon={Activity} title="This view is being built" description="Data for this page will appear here." />
    </>
  );
}
