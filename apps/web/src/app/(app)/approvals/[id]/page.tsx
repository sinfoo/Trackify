import { ApprovalDetailView } from "@/features/approvals/approval-detail";

export const metadata = { title: "Approval" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ApprovalDetailView id={id} />;
}
