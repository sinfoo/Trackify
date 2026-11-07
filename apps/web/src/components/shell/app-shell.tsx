"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui-kit";
import { EventsProvider, useEvents, type EventsStatus } from "@/hooks/use-events";
import { api, ApiError, redirectToLogin } from "@/lib/api";
import { can } from "@/lib/permissions";
import { useMe, usePendingApprovalsCount } from "@/lib/queries";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { NAV } from "./nav";

/** Client auth guard + shell. Backend enforces permissions; this only gates rendering. */
export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();

  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) redirectToLogin();
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
      <Shell user={me.data}>{children}</Shell>
    </EventsProvider>
  );
}

function Shell({ user, children }: { user: User; children: ReactNode }) {
  // Shell only mounts client-side (after /auth/me resolves), so reading localStorage here cannot mismatch SSR.
  const [collapsed, setCollapsed] = useState(() => typeof window !== "undefined" && localStorage.getItem("sidebar-collapsed") === "1");
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggle = () =>
    setCollapsed((c) => {
      localStorage.setItem("sidebar-collapsed", c ? "0" : "1");
      return !c;
    });

  return (
    <div className="flex min-h-screen">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      {/* md: icon rail, lg+: full unless collapsed */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out md:flex",
          collapsed ? "w-16" : "w-16 lg:w-62",
        )}
      >
        <SidebarContent user={user} rail={collapsed ? "always" : "md-only"} />
        <div className="hidden border-t border-sidebar-border p-2 lg:block">
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex h-9 w-full items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {collapsed ? <PanelLeftOpen aria-hidden className="size-4" /> : <PanelLeftClose aria-hidden className="size-4" />}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-4 md:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
                <Menu aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-none bg-sidebar p-0 text-sidebar-foreground">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarContent user={user} rail="never" onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="md:hidden">
            <Logo compact />
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <LiveIndicator />
            <ThemeToggle />
            <UserMenu user={user} />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

type Rail = "always" | "md-only" | "never";

function SidebarContent({ user, rail, onNavigate }: { user: User; rail: Rail; onNavigate?: () => void }) {
  const pathname = usePathname();
  const pending = usePendingApprovalsCount(can(user, "approvals:read"));
  // Label visibility per rail mode; sr-only keeps names available to screen readers in the icon rail.
  const label = rail === "always" ? "sr-only" : rail === "md-only" ? "sr-only lg:not-sr-only" : "";
  const hideInRail = rail === "always" ? "hidden" : rail === "md-only" ? "hidden lg:block" : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn("flex h-14 items-center border-b border-sidebar-border px-4", rail !== "never" && "justify-center lg:justify-start", rail === "always" && "lg:justify-center")}>
        <Logo compact={rail === "always"} railAtMd={rail === "md-only"} inverted />
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 py-3">
        {NAV.map((g, gi) => (
          <div key={g.group ?? gi} className={cn(gi > 0 && "mt-4")}>
            {g.group ? (
              <p className={cn("mb-1 px-3 text-xs font-medium tracking-wider text-sidebar-muted uppercase", hideInRail)}>
                {g.group}
              </p>
            ) : (
              <div className="mx-3 mb-3 border-t border-sidebar-border" />
            )}
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const count = item.badge === "pendingApprovals" ? pending.data : undefined;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      title={rail !== "never" ? item.label : undefined}
                      className={cn(
                        "relative flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-muted transition-colors duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-sidebar-ring",
                        active && "bg-sidebar-accent text-sidebar-accent-foreground",
                        rail === "always" && "justify-center px-0",
                        rail === "md-only" && "justify-center px-0 lg:justify-start lg:px-3",
                      )}
                    >
                      {active && (
                        <span aria-hidden className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r bg-sidebar-primary" />
                      )}
                      <Icon aria-hidden className="size-4.5 shrink-0" />
                      <span className={cn("truncate", label)}>{item.label}</span>
                      {!!count && (
                        <span
                          className={cn(
                            "num ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-sidebar-primary px-1.5 text-xs font-semibold text-sidebar-primary-foreground",
                            rail !== "never" && "absolute top-0.5 right-0.5 h-4 min-w-4 px-1 text-[10px]",
                            rail === "md-only" && "lg:static lg:h-5 lg:min-w-5 lg:px-1.5 lg:text-xs",
                          )}
                        >
                          {count}
                          <span className="sr-only"> pending</span>
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

const STATUS_UI: Record<EventsStatus, { label: string; dot: string; hint: string }> = {
  live: { label: "Live", dot: "bg-success", hint: "Connected to the event stream" },
  polling: { label: "Polling", dot: "bg-warning", hint: "WebSocket down, refreshing every 4 seconds" },
  offline: { label: "Offline", dot: "bg-danger", hint: "No connection to the event stream" },
};

function LiveIndicator() {
  const { status } = useEvents();
  const s = STATUS_UI[status];
  return (
    <span
      role="status"
      title={s.hint}
      className="mr-1 inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm font-medium"
    >
      <span aria-hidden className={cn("size-2 rounded-full", s.dot)} />
      {s.label}
      <span className="sr-only">: {s.hint}</span>
    </span>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle dark mode"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun aria-hidden className="hidden dark:block" />
      <Moon aria-hidden className="dark:hidden" />
    </Button>
  );
}

function UserMenu({ user }: { user: User }) {
  const qc = useQueryClient();
  const router = useRouter();
  const initials = user.full_name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const logout = async () => {
    try {
      await api.post("/auth/logout", undefined, { noAuthRedirect: true });
    } catch {
      // cookie may already be gone; continue to login either way
    }
    qc.clear();
    router.replace("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-1.5" aria-label={`Account menu for ${user.full_name}`}>
          <Avatar className="size-7">
            <AvatarFallback className="bg-navy text-xs font-semibold text-primary">{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden text-sm font-medium lg:inline">{user.full_name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="font-medium">{user.full_name}</p>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {user.roles.map((r) => (
              <span key={r} className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                {r.replace(/_/g, " ").toLowerCase()}
              </span>
            ))}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logout}>
          <LogOut aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-screen" aria-busy="true" aria-label="Loading">
      <div className="hidden w-16 bg-sidebar md:block lg:w-62" />
      <div className="flex-1 p-6">
        <Skeleton className="mb-6 h-8 w-56" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    </div>
  );
}
