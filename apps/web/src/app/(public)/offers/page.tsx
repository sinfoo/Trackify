import { PageHeader } from "@/components/ui-kit";
import { OfferList } from "@/features/public/offers";

export const metadata = { title: "Programs" };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6">
      <PageHeader
        title="Programs"
        description="Every program, its price, length and level. Not sure which one fits? Ask the assistant."
      />
      <OfferList />
    </div>
  );
}
