import { CreditCard } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui-kit";

export const metadata = { title: "Payments" };

export default function Page() {
  return (
    <>
      <PageHeader title="Payments" description="Simulated transactions, holds and refunds." />
      <EmptyState icon={CreditCard} title="This view is being built" description="Data for this page will appear here." />
    </>
  );
}
