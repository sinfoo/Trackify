import { Settings } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui-kit";

export const metadata = { title: "Settings" };

export default function Page() {
  return (
    <>
      <PageHeader title="Settings" description="Users, roles, AI providers and simulation settings." />
      <EmptyState icon={Settings} title="This view is being built" description="Data for this page will appear here." />
    </>
  );
}
