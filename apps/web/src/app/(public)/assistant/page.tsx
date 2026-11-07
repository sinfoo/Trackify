import { MessageCircle } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui-kit";

export const metadata = { title: "Assistant" };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6">
      <PageHeader title="Assistant" description="Chat or talk with our sales agent." />
      <EmptyState icon={MessageCircle} title="This page is being built" description="Content will appear here." />
    </div>
  );
}
