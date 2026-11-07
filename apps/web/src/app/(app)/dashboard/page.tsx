import { LayoutDashboard } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui-kit";

export const metadata = { title: "Dashboard" };

export default function Page() {
  return (
    <>
      <PageHeader title="Dashboard" description="Key numbers across sales, payments and security." />
      <EmptyState icon={LayoutDashboard} title="This view is being built" description="Data for this page will appear here." />
    </>
  );
}
