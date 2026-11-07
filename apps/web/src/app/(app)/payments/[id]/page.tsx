import { TransactionDetail } from "@/features/payments/payments";

export const metadata = { title: "Transaction" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TransactionDetail id={id} />;
}
