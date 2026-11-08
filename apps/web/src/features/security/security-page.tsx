"use client";

import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Bot, Brain, KeyRound, ListChecks, OctagonAlert, Shield, ShieldAlert, Sigma, TriangleAlert, type LucideIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, Eyebrow, RiskBar, SeverityBadge, StatusBadge, TimeAgo, Tile, humanize, type Column, type Tone } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { qk } from "@/lib/queries";
import type { Paged, SecurityEvent, SecurityOverview } from "@/lib/types";
import { InjectionTester } from "./injection-tester";
import { ALL, Chip, Page, unAll } from "./shared";

const TABS = [
  { id: "all", label: "All events", category: undefined },
  { id: "fraud", label: "Fraud", category: "FRAUD" },
  { id: "injection", label: "Prompt injection", category: "PROMPT_INJECTION" },
  { id: "agent", label: "Agent violations", category: "AGENT" },
  { id: "access", label: "Access", category: "ACCESS" },
] as const;
const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const STATUSES = ["OPEN", "INVESTIGATING", "RESOLVED", "DISMISSED"] as const;
const PAGE_SIZE = 20;

const DETECTOR: Record<string, { icon: LucideIcon; label: string }> = {
  rule: { icon: ListChecks, label: "Rule" },
  statistical: { icon: Sigma, label: "Statistical" },
  llm: { icon: Brain, label: "LLM" },
  agent: { icon: Bot, label: "Agent gateway" },
  auth: { icon: KeyRound, label: "Auth" },
};

export function Detector({ value }: { value: string }) {
  const d = DETECTOR[value?.toLowerCase()] ?? { icon: ShieldAlert, label: humanize(value || "unknown") };
  const Icon = d.icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap text-t2">
      <Icon aria-hidden className="size-3.5 text-t3" />
      {d.label}
    </span>
  );
}

/** Security KPI tile (prototype): 44px tone tile left, eyebrow + 24/800 value. */
function IconKpi({ label, value, icon: Icon, tone, loading }: { label: string; value: number; icon: LucideIcon; tone: Tone; loading: boolean }) {
  return (
    <div className="flex items-center gap-3.5 rounded-[18px] border border-hair bg-panel px-4 py-3.5 shadow-card">
      <Tile icon={Icon} size={44} radius={14} tone={tone} iconSize={20} />
      <span>
        <span className="block text-[11.5px] font-bold tracking-[.06em] uppercase text-t4">{label}</span>
        <span className="tabular mt-0.5 block text-2xl leading-none font-extrabold tracking-[-0.03em]">{loading ? "…" : formatNumber(value)}</span>
      </span>
    </div>
  );
}

/** Breakdown rows: badge · 6px bar in the badge colour · mono count. */
function Breakdown({ title, data, order, render, tone }: { title: string; data?: Record<string, number>; order?: readonly string[]; render: (k: string) => ReactNode; tone: (k: string) => Tone }) {
  const keys = order ?? Object.keys(data ?? {}).sort((a, b) => (data![b] ?? 0) - (data![a] ?? 0));
  const max = Math.max(1, ...keys.map((k) => data?.[k] ?? 0));
  return (
    <>
      <h3 className="mt-3.5 text-[13px] font-extrabold text-t2">{title}</h3>
      <ul className="mt-2 grid gap-[7px]">
        {keys.map((k) => (
          <li key={k} className="grid grid-cols-[120px_1fr_32px] items-center gap-2.5">
            <span className="min-w-0 truncate">{render(k)}</span>
            <span aria-hidden className="h-1.5 overflow-hidden rounded-[3px] bg-panel2">
              <span className="block h-full rounded-[3px] opacity-80" style={{ width: `${((data?.[k] ?? 0) / max) * 100}%`, background: `var(--${tone(k)})` }} />
            </span>
            <span className="num text-right text-[12.5px] font-semibold">{data?.[k] ?? 0}</span>
          </li>
        ))}
        {keys.length === 0 && <li className="text-[13px] text-t3">No events.</li>}
      </ul>
    </>
  );
}

const SEV_TONE: Record<string, Tone> = { CRITICAL: "danger", HIGH: "danger", MEDIUM: "warning", LOW: "info" };
const ST_TONE: Record<string, Tone> = { OPEN: "danger", INVESTIGATING: "warning", RESOLVED: "success", DISMISSED: "neutral" };

export function SecurityPage() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = TABS.find((t) => t.id === params.get("tab")) ?? TABS[0];
  const severity = unAll(params.get("severity"));
  const status = unAll(params.get("status"));
  const page = Math.max(1, Number(params.get("page")) || 1);

  const setParam = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v || v === ALL || (k === "tab" && v === "all") || (k === "page" && v === "1")) next.delete(k);
      else next.set(k, v);
    }
    if (!("page" in patch)) next.delete("page");
    const s = next.toString();
    router.replace(s ? `/security?${s}` : "/security", { scroll: false });
  };

  const overview = useQuery({ queryKey: [...qk.security, "overview"], queryFn: () => api.get<SecurityOverview>("/security/overview") });
  const list = useQuery({
    queryKey: [...qk.security, "events", tab.id, severity, status, page],
    queryFn: () =>
      tab.id === "fraud"
        ? api.get<Paged<SecurityEvent>>("/security/fraud-alerts", { query: { severity, status, page, page_size: PAGE_SIZE } })
        : api.get<Paged<SecurityEvent>>("/security/events", { query: { category: tab.category, severity, status, page, page_size: PAGE_SIZE } }),
    placeholderData: (prev) => prev,
  });

  const o = overview.data;
  const highCrit = (o?.by_severity.HIGH ?? 0) + (o?.by_severity.CRITICAL ?? 0);
  const countFor = (cat?: string) => (cat ? o?.by_category[cat] ?? 0 : o?.total ?? 0);

  const columns: Column<SecurityEvent>[] = [
    { key: "sev", header: "Severity", cell: (e) => <SeverityBadge severity={e.severity} size="lg" /> },
    {
      key: "type",
      header: "Event",
      className: "whitespace-normal",
      cell: (e) => (
        <span className="block min-w-0">
          <span className="block truncate text-sm font-bold">{humanize(e.event_type)}</span>
          <span className="block text-xs text-t3">{humanize(e.category)}</span>
        </span>
      ),
    },
    { key: "desc", header: "Description", className: "min-w-56 whitespace-normal", cell: (e) => <span className="line-clamp-2 text-[13px] text-t2">{e.description}</span> },
    { key: "risk", header: "Risk", cell: (e) => (e.risk_score == null ? <span className="text-t3">-</span> : <RiskBar score={Math.round(e.risk_score * 100)} width={48} />) },
    { key: "det", header: "Detector", cell: (e) => <Detector value={e.detector} /> },
    { key: "status", header: "Status", cell: (e) => <StatusBadge status={e.status} size="lg" /> },
    { key: "time", header: "Time", align: "right", cell: (e) => <TimeAgo date={e.created_at} className="text-[12.5px] text-t3" /> },
  ];

  return (
    <Page title="Security" description="Fraud alerts, prompt injection attempts, agent violations and access events. Updates live.">
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        <IconKpi label="Open events" value={o?.by_status.OPEN ?? 0} icon={TriangleAlert} tone="danger" loading={overview.isLoading} />
        <IconKpi label="High or critical" value={highCrit} icon={OctagonAlert} tone="danger" loading={overview.isLoading} />
        <IconKpi label="Injection attempts" value={o?.by_category.PROMPT_INJECTION ?? 0} icon={Shield} tone="warning" loading={overview.isLoading} />
        <IconKpi label="Total events" value={o?.total ?? 0} icon={ListChecks} tone="info" loading={overview.isLoading} />
      </div>

      <div className="grid items-stretch gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr))]">
        <section className="min-w-0 rounded-[22px] border border-hair bg-panel p-5 shadow-card" aria-label="Breakdown">
          <Eyebrow>Breakdown</Eyebrow>
          {overview.error ? (
            <p className="mt-3 text-[13px] text-danger">Overview unavailable.</p>
          ) : (
            <>
              <Breakdown title="By severity" data={o?.by_severity} order={SEVERITIES} render={(k) => <SeverityBadge severity={k} />} tone={(k) => SEV_TONE[k] ?? "neutral"} />
              <Breakdown title="By status" data={o?.by_status} order={STATUSES} render={(k) => <StatusBadge status={k} size="default" />} tone={(k) => ST_TONE[k] ?? "neutral"} />
              <Breakdown title="By category" data={o?.by_category} render={(k) => <span className="text-[12.5px] font-bold">{humanize(k)}</span>} tone={() => "neutral"} />
            </>
          )}
        </section>
        <InjectionTester />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Chip key={t.id} label={t.label} count={o ? countFor(t.category) : undefined} selected={tab.id === t.id} onClick={() => setParam({ tab: t.id })} />
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          <Select value={severity ?? ALL} onValueChange={(v) => setParam({ severity: v })}>
            <SelectTrigger aria-label="Filter by severity" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All severities</SelectItem>
              {SEVERITIES.map((s) => (
                <SelectItem key={s} value={s}>
                  {humanize(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status ?? ALL} onValueChange={(v) => setParam({ status: v })}>
            <SelectTrigger aria-label="Filter by status" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {humanize(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={list.data?.items}
        rowKey={(e) => e.id}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        onRowClick={(e) => router.push(`/security/${e.id}`)}
        emptyTitle="No matching events"
        emptyDescription="Try another tab or clear the filters."
        minWidth={900}
        page={page}
        pageSize={PAGE_SIZE}
        total={list.data?.total}
        onPageChange={(p) => setParam({ page: String(p) })}
      />
    </Page>
  );
}
