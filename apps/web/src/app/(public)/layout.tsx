import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/shell/logo";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { BUSINESS } from "@/lib/fixtures";

const link = "inline-flex h-11 items-center rounded-[10px] px-3 text-sm font-bold text-t2 no-underline hover:bg-panel2 hover:text-text hover:no-underline";

/** Minimal public header (64px: logo, Programs / Assistant, theme toggle, Dashboard) + footer with business details. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-[10px] focus:bg-brand focus:px-3 focus:py-2 focus:font-bold focus:text-on-brand">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-hair bg-glass backdrop-blur-[14px]">
        <div className="mx-auto flex h-16 w-full max-w-[1180px] items-center gap-2 px-6">
          <Logo tagline={false} />
          <nav aria-label="Public" className="ml-auto flex items-center gap-1">
            <Link href="/offers" className={link}>
              Programs
            </Link>
            <Link href="/assistant" className={link}>
              Assistant
            </Link>
            <ThemeToggle size={40} className="mx-1" />
            <Button asChild variant="outline" size="lg" className="hidden sm:inline-flex">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-hair bg-panel">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3 px-6 py-7 text-[13px] text-t3 md:flex-row md:items-start md:justify-between">
          <div className="max-w-md">
            <p className="font-bold text-text">
              {BUSINESS.name} <span className="font-medium text-t3">· {BUSINESS.legal}</span>
            </p>
            <p className="mt-1">
              <span className="mono">{BUSINESS.registration}</span> · {BUSINESS.address}
            </p>
            <p className="mt-1">
              <span className="mono">{BUSINESS.phone}</span> · {BUSINESS.email}
            </p>
          </div>
          <div className="flex flex-col gap-1 md:items-end">
            <Link href="/dashboard" className="font-bold sm:hidden">
              Dashboard
            </Link>
            <p className="max-w-sm md:text-right">Fictional business and demo data. Payments are simulated; no real money moves and no card data is collected.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
