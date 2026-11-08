"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, GitBranch, Search, User as UserIcon, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import type { Customer, Paged, Transaction, Workflow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { humanize } from "@/components/ui-kit";
import type { NavItem } from "./nav";

export type PaletteGroup = "Pages" | "Customers" | "Workflows" | "Payments";
export interface PaletteItem {
  id: string;
  group: PaletteGroup;
  href: string;
  label: string;
  sub: string;
  icon: LucideIcon;
  /** Icon colour (CSS). Pages use the brand text colour. */
  iconColor?: string;
}

const GROUPS: PaletteGroup[] = ["Pages", "Customers", "Workflows", "Payments"];
const DEBOUNCE_MS = 150;

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** ⌘K / Ctrl+K toggles the palette. */
export function useCommandPaletteShortcut(toggle: () => void) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
}

const items = <T,>(d: Paged<T> | T[] | undefined): T[] => (Array.isArray(d) ? d : (d?.items ?? []));

/**
 * ⌘K palette (README "Command palette"): 600px dialog radius 20, search row with "esc" kbd, results grouped
 * Pages / Customers / Workflows / Payments. Empty query = 6 pages + 3 customers + 2 workflows.
 * Up/Down move (wrap), Enter opens, Escape closes, hover selects.
 */
export function CommandPalette({ open, onOpenChange, pages }: { open: boolean; onOpenChange: (open: boolean) => void; pages: NavItem[] }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        aria-label="Jump to"
        className="top-[12vh] max-w-[600px] translate-y-0 gap-0 overflow-hidden rounded-[20px] p-0 shadow-[0_30px_80px_rgba(0,0,0,.45)] sm:max-w-[600px] data-open:zoom-in-90 data-open:duration-220 data-open:ease-[cubic-bezier(.34,1.45,.64,1)]"
      >
        <DialogTitle className="sr-only">Jump to</DialogTitle>
        {/* Body unmounts with the dialog, so query + selection reset on every open. */}
        <PaletteBody pages={pages} close={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function PaletteBody({ pages, close }: { pages: NavItem[]; close: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [rawSel, setSel] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const dq = useDebounced(q.trim(), DEBOUNCE_MS);
  const searching = dq.length > 0;

  const customers = useQuery({
    queryKey: ["palette", "customers", dq],
    queryFn: () => api.get<Paged<Customer> | Customer[]>("/customers", { query: { q: dq || undefined, page_size: 5 }, noAuthRedirect: true }),
    staleTime: 30_000,
  });
  const workflows = useQuery({
    queryKey: ["palette", "workflows", searching],
    queryFn: () => api.get<Paged<Workflow> | Workflow[]>("/workflows", { query: { page_size: searching ? 20 : 5 }, noAuthRedirect: true }),
    staleTime: 30_000,
  });
  const payments = useQuery({
    queryKey: ["palette", "payments", dq],
    queryFn: () => api.get<Paged<Transaction> | Transaction[]>("/payments/transactions", { query: { q: dq, page_size: 5 }, noAuthRedirect: true }),
    enabled: searching,
    staleTime: 30_000,
  });

  const results = useMemo<PaletteItem[]>(() => {
    const needle = dq.toLowerCase();
    const match = (...parts: (string | null | undefined)[]) => !needle || parts.some((p) => p?.toLowerCase().includes(needle));
    const out: PaletteItem[] = [];
    const pageItems = pages.filter((p) => match(p.label, p.description)).slice(0, searching ? 8 : 6);
    for (const p of pageItems) out.push({ id: `page:${p.href}`, group: "Pages", href: p.href, label: p.label, sub: p.description, icon: p.icon, iconColor: "var(--brand-text)" });
    for (const c of items(customers.data).slice(0, searching ? 5 : 3))
      out.push({ id: `cust:${c.id}`, group: "Customers", href: `/customers/${c.id}`, label: c.full_name, sub: [c.email, c.journey_stage && humanize(c.journey_stage)].filter(Boolean).join(" · "), icon: UserIcon, iconColor: "var(--c-intelligence)" });
    for (const w of items(workflows.data).filter((w) => match(w.label, w.customer_name, w.state)).slice(0, searching ? 5 : 2))
      out.push({ id: `wf:${w.id}`, group: "Workflows", href: `/workflows/${w.id}`, label: w.label, sub: `${humanize(w.state)}${w.customer_name ? ` · ${w.customer_name}` : ""}`, icon: GitBranch, iconColor: "var(--c-orchestrator)" });
    if (searching)
      for (const t of items(payments.data).slice(0, 5))
        out.push({ id: `tx:${t.id}`, group: "Payments", href: `/payments/${t.id}`, label: `${t.reference} · ${t.amount} ${t.currency}`, sub: `${humanize(t.status)} · ${t.customer?.full_name ?? ""}`, icon: CreditCard, iconColor: "var(--c-payment)" });
    return out;
  }, [pages, customers.data, workflows.data, payments.data, dq, searching]);

  // Selection is clamped on read so a shrinking result set never points past the end.
  const sel = results.length ? Math.min(rawSel, results.length - 1) : 0;
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-selected="true"]');
    el?.scrollIntoView?.({ block: "nearest" });
  }, [sel]);

  const go = (item: PaletteItem | undefined) => {
    if (!item) return;
    close();
    router.push(item.href);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || (e.key === "n" && e.ctrlKey)) {
      e.preventDefault();
      setSel((s) => (results.length ? (s + 1) % results.length : 0));
    } else if (e.key === "ArrowUp" || (e.key === "p" && e.ctrlKey)) {
      e.preventDefault();
      setSel((s) => (results.length ? (s - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[sel]);
    }
  };

  const loading = customers.isPending || workflows.isPending || (searching && payments.isPending);

  return (
    <>
    <div className="flex items-center gap-3 border-b border-hair px-[18px] py-3.5">
      <Search aria-hidden className="size-[18px] shrink-0 text-t3" strokeWidth={2} />
      <input
        autoFocus
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
        }}
        onKeyDown={onKeyDown}
        placeholder="Search pages, customers, workflows, payments…"
        aria-label="Search"
        role="combobox"
        aria-expanded
        aria-controls="palette-results"
        aria-activedescendant={results[sel] ? `palette-${results[sel].id}` : undefined}
        className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-text outline-none placeholder:text-t4"
      />
      <kbd className="rounded-md border border-hair px-1.5 py-0.5 font-mono text-[11px] text-t3">esc</kbd>
    </div>
    <ul ref={listRef} id="palette-results" role="listbox" aria-label="Results" className="max-h-[380px] overflow-x-hidden overflow-y-auto p-2">
      {GROUPS.map((g) => {
        const rows = results.filter((r) => r.group === g);
        if (!rows.length) return null;
        return (
          <li key={g} role="presentation">
            <p className="eyebrow px-3 pt-2.5 pb-1 text-[11px]">{g}</p>
            <ul role="group" aria-label={g}>
              {rows.map((it) => {
                const idx = results.indexOf(it);
                const selected = idx === sel;
                const Icon = it.icon;
                return (
                  <li key={it.id} role="presentation">
                    <button
                      type="button"
                      id={`palette-${it.id}`}
                      role="option"
                      aria-selected={selected}
                      data-selected={selected || undefined}
                      onClick={() => go(it)}
                      onMouseEnter={() => setSel(idx)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-[9px] text-left text-text transition-colors duration-100",
                        selected && "bg-panel3",
                      )}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-panel3">
                        <Icon aria-hidden className="size-[15px]" style={{ color: it.iconColor }} strokeWidth={2} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{it.label}</span>
                        <span className="block truncate text-xs text-t3">{it.sub}</span>
                      </span>
                      {selected && <span className="font-mono text-[11px] text-t3">↵</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
      {results.length === 0 && (
        <li className="px-3 py-7 text-center text-[13.5px] text-t3" role="presentation">
          {loading ? "Searching…" : `Nothing matches “${q}”.`}
        </li>
      )}
    </ul>
    <div className="flex gap-4 border-t border-hair px-[18px] py-2.5 text-[11.5px] text-t4">
      <span>
        <b className="font-mono font-semibold">↑↓</b> navigate
      </span>
      <span>
        <b className="font-mono font-semibold">↵</b> open
      </span>
      <span>
        <b className="font-mono font-semibold">⌘K</b> toggle
      </span>
    </div>
    </>
  );
}
