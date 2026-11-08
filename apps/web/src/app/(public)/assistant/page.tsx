import { AssistantChat } from "@/features/assistant/chat";

export const metadata = { title: "Assistant" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SP }) {
  const q = (await searchParams).q;
  const question = (Array.isArray(q) ? q[0] : q)?.slice(0, 500);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-3 py-4 sm:px-4 md:px-6 md:py-8">
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Ask the academy</h1>
      <p className="mt-1 mb-4 hidden text-muted-foreground sm:block">
        The sales agent answers questions about programs, prices and fit, and can enroll you when you are ready.
      </p>
      <AssistantChat initialQuestion={question} className="mt-3 h-[calc(100dvh-9.5rem)] sm:mt-0 sm:h-[min(44rem,calc(100dvh-12rem))]" />
    </div>
  );
}
