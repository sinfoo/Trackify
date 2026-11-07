import { GraduationCap } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui-kit";

export const metadata = { title: "Offers" };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6">
      <PageHeader title="Offers" description="Training programs available for enrollment." />
      <EmptyState icon={GraduationCap} title="This page is being built" description="Content will appear here." />
    </div>
  );
}
