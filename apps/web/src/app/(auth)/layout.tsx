import type { ReactNode } from "react";
import { Logo } from "@/components/shell/logo";

/**
 * Minimal auth frame so the forms compile on the new tokens. The two-panel brand layout is the auth
 * engineer's job (CLAUDE_CODE_PROMPT step 3); keep the Logo + card + disclaimer here.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-10">
      <Logo href="/" />
      <div className="w-full max-w-[420px] rounded-[22px] border border-hair bg-panel p-6 shadow-card sm:p-8">{children}</div>
      <p className="text-center text-sm text-t3">Fictional demo data. Payments are simulated; no real money moves.</p>
    </div>
  );
}
