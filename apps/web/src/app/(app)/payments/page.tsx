import { Suspense } from "react";
import { PageGuard } from "@/features/security/shared";
import { PaymentsView } from "@/features/payments/payments";

export const metadata = { title: "Payments" };

export default function Page() {
  return (
    <Suspense>
      <PageGuard perm="payments:read" title="Payments">
        <PaymentsView />
      </PageGuard>
    </Suspense>
  );
}
