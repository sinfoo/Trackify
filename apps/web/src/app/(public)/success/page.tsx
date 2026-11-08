import { SuccessView } from "@/features/checkout/outcomes";

export const metadata = { title: "Enrollment confirmed" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ref = one(sp.ref);
  const session = one(sp.session);
  return (
    <div className="px-4 py-10 md:px-6">
      <SuccessView reference={ref} session={session} />
    </div>
  );
}
