"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, PanelLeftClose, PanelLeftOpen, Search, ShoppingBag } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { ROLE_LABELS, type RoleName } from "@/lib/fixtures";
import { can } from "@/lib/permissions";
import { useBuyerFlags, usePendingApprovalsCount } from "@/lib/queries";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { visibleNav } from "./nav";

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export const roleLabel = (role: string | undefined) =>
  role ? (ROLE_LABELS[role as RoleName] ?? role.charAt(0) + role.slice(1).toLowerCase().replace(/_/g, " ")) : "";

/** POST /auth/logout (best effort), clear the query cache, go to /login. */
export function useSignOut() {
  const qc = useQueryClient();
  const router = useRouter();
  return async () => {
    try {
      await api.post("/auth/logout", undefined, { noAuthRedirect: true });
    } catch {
      // cookie may already be gone; continue to login either way
    }
    qc.clear();
    router.replace("/login");
  };
}

/**
 * Always-dark sidebar (README "Global shell"): 252px expanded / 76px rail. Below the `wide` breakpoint (1100px)
 * it is a rail regardless of `collapsed`; below md the shell shows it in a Sheet drawer (`variant="drawer"`).
 */
export function Sidebar({
  user,
  collapsed = false,
  onToggle,
  onOpenPalette,
  onNavigate,
  variant = "desktop",
  className,
}: {
  user: User;
  collapsed?: boolean;
  onToggle?: () => void;
  onOpenPalette: () => void;
  onNavigate?: () => void;
  variant?: "desktop" | "drawer";
  className?: string;
}) {
  const pathname = usePathname();
  const pending = usePendingApprovalsCount(can(user, "approvals:read"));
  const signOut = useSignOut();
  const { data: flags } = useBuyerFlags();
  const drawer = variant === "drawer";
  // Label visibility: drawer always; desktop only when expanded AND wide enough.
  const label = drawer ? "" : collapsed ? "hidden" : "hidden wide:block";
  const rail = !drawer && collapsed;

  return (
    <aside
      data-collapsed={collapsed || undefined}
      className={cn(
        "flex h-full flex-col overflow-hidden text-[#F3F5F9] [background:linear-gradient(180deg,#0A1530,#070F24)]",
        drawer ? "w-full" : "w-[76px] border-r border-white/[.06] transition-[width] duration-300 ease-[cubic-bezier(.2,.8,.2,1)]",
        !drawer && !collapsed && "wide:w-[252px]",
        className,
      )}
    >
      {/* Logo row */}
      <div className={cn("flex items-center px-5 pt-[22px] pb-[18px]", !drawer && "justify-center wide:justify-start", rail && "wide:justify-center")}>
        <Logo href="/dashboard" inverted compact={rail} className={cn(!drawer && !rail && "[&>span]:hidden wide:[&>span]:block")} />
      </div>

      {/* Jump to… ⌘K */}
      <button
        type="button"
        onClick={onOpenPalette}
        aria-label="Open command palette"
        className={cn(
          "mx-3.5 mb-2.5 flex h-10 items-center gap-2.5 rounded-xl border border-white/[.07] bg-white/[.05] px-3 text-left text-[13.5px] text-[#8A97B3] transition-colors hover:border-white/[.14] hover:bg-white/[.09]",
          !drawer && "justify-center wide:justify-start",
          rail && "wide:justify-center",
        )}
      >
        <Search aria-hidden className="size-4 shrink-0" strokeWidth={2} />
        <span className={cn("flex-1", label)}>Jump to…</span>
        <kbd className={cn("rounded-md border border-white/[.12] px-1.5 py-px font-mono text-[11px]", label)}>⌘K</kbd>
      </button>

      <nav aria-label="Main" className="flex flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto px-3.5 pt-1 pb-3.5">
        {visibleNav((perm) => can(user, perm)).map((g) => (
          <div key={g.group}>
            <p className={cn("px-2.5 py-1.5 text-[11px] font-bold tracking-[.08em] uppercase whitespace-nowrap text-[#5E6C8A]", label)}>{g.group}</p>
            <ul className="grid gap-0.5">
              {g.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const count = item.badge === "pendingApprovals" ? pending.data : undefined;
                const Icon = item.icon;
                const link = (
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={drawer || rail ? undefined : item.label}
                    className={cn(
                      // Prototype item: 40px, radius 12, padding 0 6px, gap 11, hover rgba(255,255,255,.07) + translateX(2px)
                      "relative flex h-10 items-center gap-[11px] rounded-xl px-1.5 text-sm font-semibold whitespace-nowrap text-[#9AA6C2] no-underline transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(.2,.8,.2,1)] hover:translate-x-0.5 hover:bg-white/[.07] hover:text-[#F3F5F9] hover:no-underline focus-visible:outline-[#F5A623]/60",
                      active && "bg-white/[.06] font-bold text-[#F3F5F9]",
                      !drawer && "justify-center wide:justify-start",
                      rail && "wide:justify-center",
                    )}
                  >
                    {active && <span aria-hidden className="absolute top-2.5 bottom-2.5 -left-3.5 w-[3px] rounded-r-full bg-[#F5A623]" />}
                    <span
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-[9px] transition-colors",
                        active ? "bg-[rgba(245,166,35,.16)] text-[#FFC65C]" : "bg-transparent",
                      )}
                    >
                      <Icon aria-hidden className="size-4" strokeWidth={2} />
                    </span>
                    <span className={cn("flex-1 truncate", label)}>{item.label}</span>
                    {!!count && (
                      <span
                        className={cn(
                          "tabular grid h-5 min-w-5 place-items-center rounded-full bg-[#F5A623] px-1.5 text-[11.5px] font-extrabold text-[#0B1730]",
                          !drawer && "absolute top-0.5 right-0.5 h-4 min-w-4 px-1 text-[10px] wide:static wide:h-5 wide:min-w-5 wide:px-1.5 wide:text-[11.5px]",
                          rail && "wide:absolute wide:top-0.5 wide:right-0.5 wide:h-4 wide:min-w-4 wide:px-1 wide:text-[10px]",
                        )}
                      >
                        {count}
                        <span className="sr-only"> pending</span>
                      </span>
                    )}
                  </Link>
                );
                return (
                  <li key={item.href}>
                    {rail ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right" sideOffset={8}>
                          {item.label}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* User card */}
      <div
        className={cn(
          "mx-3.5 mb-2.5 flex items-center gap-2.5 overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.04] p-2.5 whitespace-nowrap",
          !drawer && "justify-center wide:justify-start",
          rail && "wide:justify-center",
        )}
      >
        <span
          aria-hidden
          className="grid size-[34px] shrink-0 place-items-center rounded-[11px] text-xs font-extrabold text-[#FFC65C] [background:linear-gradient(145deg,#2C3F70,#1A2A52)]"
        >
          {initialsOf(user.full_name)}
        </span>
        <span className={cn("min-w-0 flex-1 leading-[1.2]", label)}>
          <span className="block truncate text-[13.5px] font-bold">{user.full_name}</span>
          <span className="block text-[11.5px] text-[#8A97B3]">{roleLabel(user.roles[0])}</span>
        </span>
        {flags?.is_buyer && (
          <Link
            href="/account"
            aria-label="Switch to buying"
            title="Switch to buying"
            className={cn("grid size-7 shrink-0 place-items-center rounded-lg text-[#8A97B3] transition-colors hover:bg-white/[.08] hover:text-[#F3F5F9]", label)}
          >
            <ShoppingBag aria-hidden className="size-[15px]" />
          </Link>
        )}
        <button
          type="button"
          onClick={signOut}
          aria-label="Sign out"
          title="Sign out"
          className={cn("grid size-7 shrink-0 place-items-center rounded-lg text-[#8A97B3] transition-colors hover:bg-white/[.08] hover:text-[#F3F5F9]", label)}
        >
          <LogOut aria-hidden className="size-[15px]" />
        </button>
      </div>

      {onToggle && !drawer && (
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="mx-3.5 mb-3.5 hidden h-9 items-center justify-center gap-2 rounded-[10px] text-[12.5px] font-bold text-[#5E6C8A] transition-colors hover:bg-white/[.06] hover:text-[#F3F5F9] wide:flex"
        >
          {collapsed ? <PanelLeftOpen aria-hidden className="size-4" /> : <PanelLeftClose aria-hidden className="size-4" />}
        </button>
      )}
    </aside>
  );
}
