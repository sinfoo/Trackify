import { AssistantChat } from "@/features/assistant/chat";

export const metadata = { title: "Assistant" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SP }) {
  const q = (await searchParams).q;
  const question = (Array.isArray(q) ? q[0] : q)?.slice(0, 500);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-4 py-8 md:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Ask the academy</h1>
      <p className="mt-1 mb-5 text-muted-foreground">
        The sales agent answers questions about programs, prices and fit, and can enroll you when you are ready.
      </p>
      <AssistantChat initialQuestion={question} className="h-[min(44rem,calc(100dvh-12rem))]" />
    </div>
  );
}
