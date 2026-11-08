"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ClipboardCheck, ExternalLink, LogOut, Menu, ShieldAlert } from "lucide-react";
import { ThemeToggle } from "@/components/theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SimulatedBadge, TimeAgo } from "@/components/ui-kit";
import { useEvents, type EventsStatus } from "@/hooks/use-events";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { navFor } from "./nav";
import { initialsOf, roleLabel, useSignOut } from "./sidebar";

// Prototype header controls: 36px, --panel2 + hairline, round.
const ROUND = "inline-flex h-9 items-center justify-center rounded-full border border-hair bg-panel2 text-t2 transition-colors hover:bg-panel3";

/** Sticky glass header, 60px (padding 0 28px): eyebrow + title 17/800; Live pill, Simulated, bell, theme, Public site, avatar. */
export function Header({ user, onOpenMenu, className }: { user: User; onOpenMenu?: () => void; className?: string }) {
  const pathname = usePathname();
  const nav = navFor(pathname);
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-[60px] items-center gap-3 border-b border-hair bg-glass px-4 backdrop-blur-[14px] md:px-7",
        className,
      )}
    >
      {onOpenMenu && (
        <button type="button" onClick={onOpenMenu} aria-label="Open navigation" className={cn(ROUND, "size-9 md:hidden")}>
          <Menu aria-hidden className="size-4" />
        </button>
      )}
      <div className="min-w-0 leading-[1.1]">
        <p className="eyebrow">{nav?.group ?? "Trackify"}</p>
        <h1 className="mt-[3px] truncate text-[17px] font-extrabold tracking-[-0.01em]">{nav?.item.label ?? "Console"}</h1>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <LivePill />
        <SimulatedBadge className="hidden sm:inline-flex" />
        <NotificationsBell />
        <ThemeToggle size={36} />
        <Link href="/" className={cn(ROUND, "hidden gap-1.5 px-3 text-[12.5px] font-bold no-underline hover:no-underline lg:inline-flex")}>
          <ExternalLink aria-hidden className="size-3.5" />
          Public site
        </Link>
        <UserMenu user={user} />
      </div>
    </header>
  );
}

const STATUS_UI: Record<EventsStatus, { label: string; cls: string; dot: string; hint: string }> = {
  live: { label: "Live", cls: "bg-success-bg text-success", dot: "bg-[#3DCB8B] anim-live-pip", hint: "Connected to the event stream" },
  polling: { label: "Polling", cls: "bg-warning-bg text-warning", dot: "bg-warning", hint: "Socket down, refreshing every 4 seconds" },
  offline: { label: "Offline", cls: "bg-danger-bg text-danger", dot: "bg-danger", hint: "No connection to the event stream" },
};

/** 34px pill: pulsing 8px dot + Live / Polling / Offline from `useEvents().status`. */
export function LivePill({ className }: { className?: string }) {
  const { status } = useEvents();
  const s = STATUS_UI[status];
  return (
    <span
      role="status"
      title={s.hint}
      className={cn("inline-flex h-9 items-center gap-2 rounded-full pr-3.5 pl-3 text-[13px] font-bold whitespace-nowrap", s.cls, className)}
    >
      <span aria-hidden className={cn("size-2 rounded-full", s.dot)} />
      {s.label}
      <span className="sr-only">: {s.hint}</span>
    </span>
  );
}

/** Bell with amber dot; popover lists the last 5 security.alert / approval.requested events. */
function NotificationsBell() {
  const { events } = useEvents();
  const alerts = events.filter((e) => e.type === "security.alert" || e.type === "approval.requested").slice(0, 5);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Notifications${alerts.length ? `, ${alerts.length} new` : ""}`} className={cn(ROUND, "relative size-9")}>
          <Bell aria-hidden className="size-4" />
          {alerts.length > 0 && <span aria-hidden className="absolute top-1.5 right-[7px] size-2 rounded-full border-2 border-bg bg-brand" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 rounded-2xl border-hair bg-panel p-2 shadow-lift">
        <DropdownMenuLabel className="eyebrow px-2 pt-1.5 pb-1">Needs attention</DropdownMenuLabel>
        {alerts.length === 0 ? (
          <p className="px-2 py-3 text-[13px] text-t3">No alerts or approval requests yet.</p>
        ) : (
          alerts.map((e) => {
            const approval = e.type === "approval.requested";
            const Icon = approval ? ClipboardCheck : ShieldAlert;
            return (
              <DropdownMenuItem key={e.id} asChild className="rounded-xl p-2 focus:bg-panel3">
                <Link href={approval ? "/approvals" : "/security"} className="flex items-start gap-2.5 no-underline hover:no-underline">
                  <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", approval ? "bg-warning-bg text-warning" : "bg-danger-bg text-danger")}>
                    <Icon aria-hidden className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-text">{e.summary}</span>
                    <span className="mono block text-[11px] text-t3">
                      {e.type} · <TimeAgo date={e.created_at} />
                    </span>
                  </span>
                </Link>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ user }: { user: User }) {
  const signOut = useSignOut();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu for ${user.full_name}`}
          className="grid size-9 shrink-0 place-items-center rounded-full text-xs font-extrabold text-[#FFC65C] [background:linear-gradient(145deg,#2C3F70,#1A2A52)] ring-2 ring-transparent transition-shadow hover:ring-brand/40"
        >
          {initialsOf(user.full_name)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-2xl border-hair bg-panel p-2 shadow-lift">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-bold">{user.full_name}</p>
          <p className="truncate text-xs text-t3">{user.email}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {user.roles.map((r) => (
              <span key={r} className="rounded-full bg-panel3 px-2 py-0.5 text-[11px] font-bold">
                {roleLabel(r)}
              </span>
            ))}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-hair" />
        <DropdownMenuItem onSelect={signOut} className="rounded-xl focus:bg-panel3">
          <LogOut aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
