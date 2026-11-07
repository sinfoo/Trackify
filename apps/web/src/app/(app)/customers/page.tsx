import { Suspense } from "react";
import { PageHeader } from "@/components/ui-kit";
import { CustomersView } from "@/features/customers/customers-view";

export const metadata = { title: "Customers" };

export default function Page() {
  return (
    <>
      <PageHeader title="Customers" description="Profiles, journey stage, intent and history." />
      <Suspense>
        <CustomersView />
      </Suspense>
    </>
  );
}
