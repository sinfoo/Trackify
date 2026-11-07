import type { ReactNode } from "react";
import { Logo } from "@/components/shell/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-10">
      <Logo />
      <div className="w-full max-w-md rounded-xl border bg-card p-6 sm:p-8">{children}</div>
      <p className="text-center text-sm text-muted-foreground">
        Fictional demo data. Payments are simulated; no real money moves.
      </p>
    </div>
  );
}
