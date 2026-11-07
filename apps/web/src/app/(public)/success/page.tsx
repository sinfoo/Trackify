import { SuccessView } from "@/features/checkout/outcomes";

export const metadata = { title: "Enrollment confirmed" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: SP }) {
  const ref = one((await searchParams).ref);
  return (
    <div className="px-4 py-10 md:px-6">
      <SuccessView reference={ref} />
    </div>
  );
}
