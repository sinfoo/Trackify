import { OfferDetail } from "@/features/public/offers";

export const metadata = { title: "Program" };

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <div className="anim-rise mx-auto w-full max-w-[1180px] px-6 pt-10 pb-[72px]">
      <OfferDetail slug={slug} />
    </div>
  );
}
