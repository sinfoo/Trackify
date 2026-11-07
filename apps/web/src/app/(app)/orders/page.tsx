import { Suspense } from "react";
import { OrdersView } from "@/features/orders/orders";

export const metadata = { title: "Orders" };

export default function Page() {
  return (
    <Suspense>
      <OrdersView />
    </Suspense>
  );
}
