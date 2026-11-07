import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shell/logo";
import { ThemeToggle } from "@/components/shell/app-shell";

const link = "rounded-md px-2.5 py-2 whitespace-nowrap hover:bg-muted sm:px-3";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-4 md:px-6">
          <Logo />
          <nav aria-label="Public" className="ml-auto flex items-center gap-0.5 text-sm font-medium">
            <Link href="/offers" className={link}>
              Programs
            </Link>
            <Link href="/assistant" className={link}>
              Assistant
            </Link>
            <ThemeToggle />
            <Button asChild variant="outline" size="lg" className="ml-1 hidden px-3 sm:inline-flex">
              <Link href="/login">Team sign in</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-6">
          <p>Fictional academy and demo data. Payments are simulated; no real money moves and no card data is collected.</p>
          <p className="flex gap-4">
            <Link href="/login" className="underline-offset-4 hover:underline sm:hidden">
              Team sign in
            </Link>
            <span>TECHX Tunisia hackathon</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
