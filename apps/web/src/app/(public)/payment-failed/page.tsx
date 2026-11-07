import { CircleX } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui-kit";

export const metadata = { title: "Payment failed" };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6">
      <PageHeader title="Payment failed" description="The simulated payment did not go through." />
      <EmptyState icon={CircleX} title="This page is being built" description="Content will appear here." />
    </div>
  );
}
