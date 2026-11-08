"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui-kit";
import { ScenarioClockProvider } from "@/features/agents/scenario-clock";
import { useEventToasts } from "@/features/settings/preferences";
import { EventsProvider } from "@/hooks/use-events";
import { ApiError } from "@/lib/api";
import { can } from "@/lib/permissions";
import { useMe } from "@/lib/queries";
import type { User } from "@/lib/types";
import { CommandPalette, useCommandPaletteShortcut } from "./command-palette";
import { Header } from "./header";
import { visibleNav } from "./nav";
import { Sidebar } from "./sidebar";

export { ThemeToggle } from "@/components/theme";

const SIDEBAR_KEY = "trackify-sidebar";

/** Client auth guard + admin shell. Backend enforces permissions; this only gates rendering. */
export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();

  useEffect(() => {
    // Route guard: no session -> /login, which shows "Sign in to open the console." for ?reason=guard.
    if (me.error instanceof ApiError && me.error.status === 401) {
      const { pathname, search } = window.location;
      window.location.replace(`/login?next=${encodeURIComponent(pathname + search)}&reason=guard`);
    }
  }, [me.error]);

  if (me.isPending || (me.error instanceof ApiError && me.error.status === 401)) return <ShellSkeleton />;
  if (me.error)
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <ErrorState error={me.error} title="Cannot reach the API" onRetry={() => me.refetch()} className="w-full max-w-md" />
      </div>
    );

  return (
    <EventsProvider>
      <ScenarioClockProvider>
        <EventToasts />
        <Shell user={me.data}>{children}</Shell>
      </ScenarioClockProvider>
    </EventsProvider>
  );
}

function Shell({ user, children }: { user: User; children: ReactNode }) {
  const pathname = usePathname();
  // Shell only mounts client-side (after /auth/me resolves), so reading localStorage here cannot mismatch SSR.
  const [collapsed, setCollapsed] = useState(() => typeof window !== "undefined" && localStorage.getItem(SIDEBAR_KEY) === "1");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const togglePalette = useCallback(() => setPaletteOpen((o) => !o), []);
  useCommandPaletteShortcut(togglePalette);

  const toggleSidebar = () =>
    setCollapsed((c) => {
      localStorage.setItem(SIDEBAR_KEY, c ? "0" : "1");
      return !c;
    });
  const openPalette = () => {
    setMobileOpen(false);
    setPaletteOpen(true);
  };
  const pages = visibleNav((perm) => can(user, perm)).flatMap((g) => g.items);

  // Scroll to top on route change (README "Interactions").
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="flex min-h-screen">
      <a
        href="#main"
        className="sr-only z-50 rounded-[10px] bg-brand px-3 py-2 font-bold text-on-brand focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <div className="sticky top-0 hidden h-screen shrink-0 md:block">
        <Sidebar user={user} collapsed={collapsed} onToggle={toggleSidebar} onOpenPalette={openPalette} />
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" showCloseButton={false} className="w-[280px] border-0 bg-transparent p-0 shadow-none">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar user={user} variant="drawer" onOpenPalette={openPalette} onNavigate={() => setMobileOpen(false)} className="rounded-r-[22px]" />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header user={user} onOpenMenu={() => setMobileOpen(true)} />
        <main id="main" className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-[22px] md:px-[26px]">
          <div key={pathname} className="anim-rise flex flex-col gap-5">
            {children}
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} pages={pages} />
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-screen" aria-busy="true" aria-label="Loading">
      <div className="hidden w-[76px] [background:linear-gradient(180deg,#0A1530,#070F24)] md:block wide:w-[252px]" />
      <div className="flex-1">
        <div className="h-[60px] border-b border-hair" />
        <div className="p-[26px]">
          <Skeleton className="mb-6 h-8 w-56" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-[18px]" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function EventToasts() {
  useEventToasts();
  return null;
}
