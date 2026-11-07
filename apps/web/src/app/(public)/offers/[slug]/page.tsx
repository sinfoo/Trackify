import { OfferDetail } from "@/features/public/offers";

export const metadata = { title: "Program" };

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6">
      <OfferDetail slug={slug} />
    </div>
  );
}
