import { SecurityEventDetail } from "@/features/security/security-event-detail";

export const metadata = { title: "Security event" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SecurityEventDetail id={id} />;
}
