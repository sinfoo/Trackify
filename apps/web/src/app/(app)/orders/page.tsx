import { ShoppingCart } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui-kit";

export const metadata = { title: "Orders" };

export default function Page() {
  return (
    <>
      <PageHeader title="Orders" description="Orders and enrollments." />
      <EmptyState icon={ShoppingCart} title="This view is being built" description="Data for this page will appear here." />
    </>
  );
}
