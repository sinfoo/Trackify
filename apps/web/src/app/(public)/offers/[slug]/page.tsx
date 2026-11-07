import { GraduationCap } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui-kit";

export const metadata = { title: "Offer" };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6">
      <PageHeader title="Offer" description="Program details, outcomes and seats left." />
      <EmptyState icon={GraduationCap} title="This page is being built" description="Content will appear here." />
    </div>
  );
}
