import { Package } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui-kit";

export const metadata = { title: "Products" };

export default function Page() {
  return (
    <>
      <PageHeader title="Products" description="Training offers, pricing and seats." />
      <EmptyState icon={Package} title="This view is being built" description="Data for this page will appear here." />
    </>
  );
}
