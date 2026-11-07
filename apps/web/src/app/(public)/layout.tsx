import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shell/logo";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 md:px-6">
          <Logo />
          <nav aria-label="Public" className="ml-auto flex items-center gap-1 text-sm font-medium">
            <Link href="/offers" className="rounded-md px-3 py-2 hover:bg-muted">
              Offers
            </Link>
            <Link href="/assistant" className="rounded-md px-3 py-2 hover:bg-muted">
              Assistant
            </Link>
            <Button asChild size="lg" className="ml-2 px-4">
              <Link href="/login">Sign in</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-6 text-sm text-muted-foreground md:flex-row md:justify-between md:px-6">
          <p>Fictional demo data. Payments are simulated; no real money moves.</p>
          <p>TECHX Tunisia hackathon</p>
        </div>
      </footer>
    </div>
  );
}
