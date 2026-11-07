import { Suspense } from "react";
import { PaymentsView } from "@/features/payments/payments";

export const metadata = { title: "Payments" };

export default function Page() {
  return (
    <Suspense>
      <PaymentsView />
    </Suspense>
  );
}
