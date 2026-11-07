import { PageHeader } from "@/components/ui-kit";
import { Studio } from "@/features/studio/studio";

export const metadata = { title: "Conversation Studio" };

export default function Page() {
  return (
    <>
      <PageHeader
        title="Conversation Studio"
        description="Play the customer on the left. On the right, watch the agents screen, answer, analyse and charge in real time."
      />
      <Studio />
    </>
  );
}
