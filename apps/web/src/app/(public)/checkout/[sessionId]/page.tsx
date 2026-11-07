import { PageHeader } from "@/components/ui-kit";
import { CheckoutView } from "@/features/checkout/checkout-view";

export const metadata = { title: "Checkout" };

export default async function Page({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 md:px-6">
      <PageHeader title="Checkout" description="Simulated payment. No real money moves." />
      <CheckoutView sessionId={sessionId} />
    </div>
  );
}
