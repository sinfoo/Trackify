import { ShieldCheck } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui-kit";

export const metadata = { title: "Security" };

export default function Page() {
  return (
    <>
      <PageHeader title="Security" description="Fraud alerts, prompt injection attempts and risk events." />
      <EmptyState icon={ShieldCheck} title="This view is being built" description="Data for this page will appear here." />
    </>
  );
}
