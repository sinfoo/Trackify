import { CreditCard } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui-kit";

export const metadata = { title: "Checkout" };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6">
      <PageHeader title="Checkout" description="Simulated payment. No real money moves." />
      <EmptyState icon={CreditCard} title="This page is being built" description="Content will appear here." />
    </div>
  );
}
