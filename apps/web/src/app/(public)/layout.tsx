import type { ReactNode } from "react";
import { PublicFooter, PublicHeader } from "@/features/public/shell";

/** Public shell per the prototype: sticky glass header (68px), footer with the business details. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-[10px] focus:bg-brand focus:px-3 focus:py-2 focus:font-bold focus:text-on-brand">
        Skip to content
      </a>
      <PublicHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
