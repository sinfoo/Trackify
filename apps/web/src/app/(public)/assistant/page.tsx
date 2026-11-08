import { AssistantPage } from "@/features/assistant/assistant-page";

export const metadata = { title: "Assistant" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SP }) {
  const q = (await searchParams).q;
  const question = (Array.isArray(q) ? q[0] : q)?.slice(0, 500);
  return <AssistantPage initialQuestion={question} />;
}
