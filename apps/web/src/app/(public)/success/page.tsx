import { SuccessView } from "@/features/checkout/outcomes";

export const metadata = { title: "Enrollment confirmed" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return (
    <div className="px-6 pt-16 pb-20">
      <SuccessView reference={one(sp.ref)} session={one(sp.session)} />
    </div>
  );
}
