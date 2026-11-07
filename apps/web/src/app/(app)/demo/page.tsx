import { FlaskConical } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui-kit";

export const metadata = { title: "Demo control" };

export default function Page() {
  return (
    <>
      <PageHeader title="Demo control" description="Run scripted scenarios and reset demo data." />
      <EmptyState icon={FlaskConical} title="This view is being built" description="Data for this page will appear here." />
    </>
  );
}
