import { Users } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui-kit";

export const metadata = { title: "Customers" };

export default function Page() {
  return (
    <>
      <PageHeader title="Customers" description="Profiles, journey stage, intent and history." />
      <EmptyState icon={Users} title="This view is being built" description="Data for this page will appear here." />
    </>
  );
}
