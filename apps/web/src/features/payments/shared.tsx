"use client";

// Building blocks shared by the generic list + detail pages (customers / products / orders / payments / audit).

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { AgentAvatar, agentColors, type Column } from "@/components/ui-kit";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

/** URL search params as filter state. Any change except `page` resets pagination. */
export function useUrlParams() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const set = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (!("page" in patch)) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [sp, router, pathname],
  );
  return [sp, set] as const;
}

/** Debounced (300ms) local copy of a URL search value. */
export function useDebouncedSearch(value: string, commit: (v: string | null) => void) {
  const [search, setSearch] = useState(value);
  useEffect(() => {
    if (search.trim() === value) return;
    const t = setTimeout(() => commit(search.trim() || null), 300);
    return () => clearTimeout(t);
  }, [search, value, commit]);
  return [search, setSearch] as const;
}

// ---------------------------------------------------------------- list page chrome (prototype GENERIC LIST block)

/** Page column: flex, gap 18, `rise` enter animation. */
export function ListPage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("anim-rise flex flex-col gap-[18px]", className)}>{children}</div>;
}

/** Filter row: search + chips + selects, 8px gap, wraps. */
export function Toolbar({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div role="group" aria-label={label ?? "Filters"} className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  );
}

/** 40px search field: --input fill, hairline, radius 12, search icon, flex 1 1 240px up to 360px. */
export function SearchBox({
  value,
  onChange,
  placeholder,
  label = "Search",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label?: string;
  className?: string;
}) {
  return (
    <label className={cn("flex h-10 flex-[1_1_240px] items-center gap-2.5 rounded-xl border border-hair bg-input px-3 text-[13.5px] text-t4 transition-[border-color,box-shadow] focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/35 sm:max-w-[360px]", className)}>
      <Search aria-hidden className="size-[15px] shrink-0" />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-[13.5px] text-text outline-none placeholder:text-t4"
      />
    </label>
  );
}

/** 34px round filter chip: selected = --text fill / --bg text; idle = --panel + hairline, --t2. */
export function FilterChip({
  selected,
  onClick,
  children,
  count,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex h-[34px] items-center gap-[7px] rounded-full border px-3 text-[13px] font-bold whitespace-nowrap transition-[background-color,color] duration-200 focus-visible:ring-2 focus-visible:ring-brand/35 focus-visible:outline-none",
        selected ? "border-text bg-text text-bg" : "border-hair bg-panel text-t2 hover:bg-panel2",
        className,
      )}
    >
      {children}
      {count !== undefined && count !== null && <span className="tabular opacity-70">{count}</span>}
    </button>
  );
}

/** Native <select> styled like the toolbar search (40px, radius 12). */
export const selectClass =
  "h-10 rounded-xl border border-hair bg-input px-3 text-[13.5px] text-text outline-none transition-[border-color,box-shadow] focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/35 aria-invalid:border-danger [&>option]:bg-panel [&>option]:text-text";

export function FilterSelect({
  label,
  value,
  onChange,
  children,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cn(selectClass, className)}>
      {children}
    </select>
  );
}

/** 40px prototype list/detail action button classes (`action()` in the prototype). Pair with `<Button variant>`. */
export const actionBtn = "h-10 rounded-xl px-4 text-[13.5px] font-extrabold [&_svg:not([class*='size-'])]:size-[15px]";

// ---------------------------------------------------------------- cells

export const initialsOf = (name: string | null | undefined) =>
  (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

/** Prototype `who()` cell: 32px tile (initials or icon) · 14/700 title · 12px --t3 sub (optionally mono). */
export function WhoCell({
  title,
  sub,
  subMono,
  initials,
  agent,
  icon,
  className,
}: {
  title: ReactNode;
  sub?: ReactNode;
  subMono?: boolean;
  /** Initials on --panel3 (customers, users). */
  initials?: string;
  /** Agent id: coloured agent tile. */
  agent?: string;
  /** Custom tile: icon + colours. */
  icon?: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; color: string; bg: string };
  className?: string;
}) {
  const Icon = icon?.icon;
  return (
    <span className={cn("inline-flex min-w-0 max-w-full items-center gap-[9px]", className)}>
      {agent ? (
        <AgentAvatar agentId={agent} size={32} />
      ) : (
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-[10px] text-[11px] font-extrabold"
          style={Icon ? { color: icon!.color, background: icon!.bg } : { background: "var(--panel3)", color: "var(--text)" }}
        >
          {Icon ? <Icon className="size-[15px]" strokeWidth={2} /> : initials}
        </span>
      )}
      <span className="min-w-0 leading-[1.2]">
        <span className="block truncate text-sm font-bold">{title}</span>
        {sub && <span className={cn("mt-px block truncate text-xs text-t3", subMono && "mono")}>{sub}</span>}
      </span>
    </span>
  );
}

/** Agent colour pair as `{ color, bg }` for DetailItem / WhoCell / DetailPage tiles. */
export function agentTile(id: string) {
  const c = agentColors(id);
  return { color: c.color, bg: c.background };
}

/** Audit / timeline actor: "agent:payment" → agent tile + name; "user:x" / email → user tile. */
export function ActorCell({ type, id }: { type?: string | null; id: string | null | undefined }) {
  if (!id) return <span className="text-t4">{type ?? "—"}</span>;
  const agent = type === "agent" || id.startsWith("agent:") ? id.replace(/^agent:/, "") : null;
  if (agent) return <WhoCell className="max-w-[220px]" agent={agent} title={`${agent.charAt(0).toUpperCase()}${agent.slice(1)} agent`} sub="agent" />;
  const label = id.replace(/^user:/, "");
  return <WhoCell className="max-w-[220px]" initials={initialsOf(label.split("@")[0].replace(/[._-]/g, " "))} title={label} sub={type ?? "user"} />;
}

/** Prototype list grid: 16px between columns, 20px at the card edges (the Table primitive pads 20px per side). */
export const tight = "px-2 first:pl-5 last:pr-5";
export const tighten = <T,>(columns: Column<T>[]): Column<T>[] => columns.map((c) => ({ ...c, className: cn(tight, c.className) }));

/** "Showing n of m" footer copy for unpaginated lists (DataTable only renders a footer when paged). */
export const unpaged = <T,>(rows: T[] | undefined) => ({ page: 1, pageSize: Math.max(1, rows?.length ?? 0), total: rows?.length ?? 0 });

// ---------------------------------------------------------------- errors

/** Field-level messages from the backend 422 envelope: details.errors[{loc:["body","price"],msg}]. */
export function serverFieldErrors(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!(err instanceof ApiError)) return out;
  const errors = (err.details?.errors as { loc?: unknown[]; msg?: string }[] | undefined) ?? [];
  for (const e of errors) {
    const field = e.loc?.[e.loc.length - 1];
    if (typeof field === "string" && e.msg) out[field] = e.msg.replace(/^Value error, /, "");
    else if (typeof field === "number" && e.loc && typeof e.loc[e.loc.length - 2] === "string")
      out[e.loc[e.loc.length - 2] as string] = e.msg ?? "Invalid value";
  }
  return out;
}

export function errorText(err: unknown) {
  if (err instanceof ApiError) return err.status === 403 ? "Your role does not have access to this." : err.message;
  return err instanceof Error ? err.message : "Something went wrong.";
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-xs font-semibold text-danger">
      {message}
    </p>
  );
}

/** Time of day in mono (HH:MM:SS, en-GB) with the full timestamp as title. */
export function Clock({ date, className }: { date: string | null | undefined; className?: string }) {
  if (!date) return <span className={cn("text-t4", className)}>—</span>;
  const d = new Date(date);
  return (
    <time dateTime={date} title={d.toLocaleString("en-GB")} className={cn("num whitespace-nowrap", className)} suppressHydrationWarning>
      {d.toLocaleTimeString("en-GB")}
    </time>
  );
}
