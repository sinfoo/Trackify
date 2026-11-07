import { PaymentFailedView } from "@/features/checkout/outcomes";

export const metadata = { title: "Payment not completed" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return (
    <div className="px-4 py-10 md:px-6">
      <PaymentFailedView session={one(sp.session)} reason={one(sp.reason)?.slice(0, 300)} />
    </div>
  );
}
