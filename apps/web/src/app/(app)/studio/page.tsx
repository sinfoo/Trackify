import { Sparkles } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui-kit";

export const metadata = { title: "Studio" };

export default function Page() {
  return (
    <>
      <PageHeader title="Studio" description="Conversations with prospects and the insights agents extracted." />
      <EmptyState icon={Sparkles} title="This view is being built" description="Data for this page will appear here." />
    </>
  );
}
