import { CheckoutView } from "@/features/checkout/checkout-view";

export const metadata = { title: "Checkout" };

export default async function Page({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return (
    <div className="anim-rise mx-auto w-full max-w-[1080px] px-6 pt-10 pb-[72px]">
      <CheckoutView sessionId={sessionId} />
    </div>
  );
}
