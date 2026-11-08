"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, Moon, Sun, UserRound } from "lucide-react";
import { Logo } from "@/components/shell/logo";
import { useTrackifyTheme } from "@/components/theme";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { hasSession, subscribeSession } from "./api";
import { useBusiness } from "./business";

/** Anonymous probe: a 401 here is normal and must not bounce the visitor to /login. */
function usePublicMe() {
  return useQuery({
    queryKey: ["public", "me"],
    queryFn: () => api.get<User>("/auth/me", { noAuthRedirect: true }),
    staleTime: 60_000,
    retry: false,
  });
}

const NAV = [
  { href: "/offers", label: "Programs" },
  { href: "/assistant", label: "Assistant" },
  { href: "/my", label: "My Trackify", session: true, icon: UserRound },
];
const noSession = () => false;

/** Prototype public header: sticky glass, 68px, logo + "Run by six AI agents", nav, theme, Dashboard. */
export function PublicHeader() {
  const pathname = usePathname() ?? "/";
  const me = usePublicMe();
  const { toggle } = useTrackifyTheme();
  // "My Trackify" only once this browser holds a conversation (server renders without it).
  const session = useSyncExternalStore(subscribeSession, hasSession, noSession);
  return (
    <header className="sticky top-0 z-30 border-b border-hair bg-glass backdrop-blur-[14px]">
      <div className="mx-auto flex h-[68px] w-full max-w-[1180px] items-center gap-2.5 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-[11px] text-text no-underline hover:no-underline" aria-label="Trackify, home">
          <Logo compact size={36} href={null} />
          <span className="hidden leading-[1.1] whitespace-nowrap sm:block">
            <span className="block text-[15px] font-extrabold">
              Track
              <span className="relative inline-block">
                ı<span aria-hidden className="absolute top-[.06em] left-1/2 size-[.17em] -translate-x-1/2 rounded-full bg-[#F5A623]" />
              </span>
              fy
            </span>
            <span className="mt-0.5 hidden text-[11.5px] text-t3 sm:block">Run by six AI agents</span>
          </span>
        </Link>
        <nav aria-label="Public" className="ml-auto flex items-center gap-1">
          {NAV.filter((n) => !n.session || session).map((n) => {
            const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-[38px] items-center gap-[7px] rounded-[11px] px-2 text-sm font-bold whitespace-nowrap no-underline hover:bg-panel2 hover:no-underline sm:px-3.5",
                  active ? "bg-panel3 text-text" : "text-t2",
                )}
                aria-label={n.icon ? n.label : undefined}
              >
                {n.icon && <n.icon aria-hidden className="size-4" />}
                <span className={n.icon ? "hidden sm:inline" : undefined}>{n.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            aria-label="Toggle theme"
            onClick={toggle}
            className="grid size-[38px] place-items-center rounded-[11px] text-t2 hover:bg-panel2 [&_svg]:size-4"
          >
            <Sun aria-hidden className="hidden dark:block" />
            <Moon aria-hidden className="dark:hidden" />
          </button>
          <Link
            href={me.data ? "/dashboard" : "/login"}
            aria-label="Dashboard"
            className="ml-1.5 inline-flex h-[38px] items-center gap-[7px] rounded-[11px] border border-hair bg-panel px-2.5 text-[13.5px] font-extrabold text-text no-underline hover:bg-panel2 hover:no-underline sm:px-3.5"
          >
            <LayoutDashboard aria-hidden className="size-3.5" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

/** Prototype public footer: business line, contact line, fictional-data disclaimer, "Team sign in". */
export function PublicFooter() {
  const { biz } = useBusiness();
  return (
    <footer className="border-t border-hair bg-panel">
      <div className="mx-auto flex w-full max-w-[1180px] flex-wrap justify-between gap-3 px-6 py-[22px] text-[13px] text-t3">
        <div className="grid gap-1">
          <p className="font-extrabold text-text">
            {biz.name}{" "}
            <span className="font-medium text-t3">
              · {biz.legal_name} · {biz.registration}
            </span>
          </p>
          <p>
            {biz.address} · {biz.phone} · {biz.email}
          </p>
          <p>Fictional business and demo data. Payments are simulated; no real money moves and no card data is collected.</p>
        </div>
        <p className="flex items-start gap-4">
          <Link href="/login" className="font-bold text-t2 no-underline hover:underline">
            Team sign in
          </Link>
          <span>TECHX Tunisia hackathon · Trackify</span>
        </p>
      </div>
    </footer>
  );
}
