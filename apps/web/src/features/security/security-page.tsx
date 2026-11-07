"use client";

import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Bot, Brain, KeyRound, ListChecks, Sigma, ShieldAlert, type LucideIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DataTable,
  KpiCard,
  PageHeader,
  SeverityBadge,
  StatusBadge,
  TimeAgo,
  humanize,
  type Column,
} from "@/components/ui-kit";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { qk } from "@/lib/queries";
import type { Paged, SecurityEvent, SecurityOverview } from "@/lib/types";
import { InjectionTester } from "./injection-tester";
import { ALL, Panel, RiskScore, unAll } from "./shared";

const TABS = [
  { id: "all", label: "All events", category: undefined },
  { id: "fraud", label: "Fraud alerts", category: "FRAUD" },
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
    <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap">
      <Icon aria-hidden className="size-4 text-muted-foreground" />
      {d.label}
    </span>
  );
}

function Breakdown({ title, data, order, render }: { title: string; data?: Record<string, number>; order?: readonly string[]; render: (k: string) => ReactNode }) {
  const keys = order ?? Object.keys(data ?? {}).sort((a, b) => (data![b] ?? 0) - (data![a] ?? 0));
  const max = Math.max(1, ...keys.map((k) => data?.[k] ?? 0));
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      <ul className="space-y-2">
        {keys.map((k) => (
          <li key={k} className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-3 text-sm">
            <span className="truncate">{render(k)}</span>
            <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-foreground/35" style={{ width: `${((data?.[k] ?? 0) / max) * 100}%` }} />
            </span>
            <span className="num text-right font-medium">{data?.[k] ?? 0}</span>
          </li>
        ))}
        {keys.length === 0 && <li className="text-sm text-muted-foreground">No events.</li>}
      </ul>
    </div>
  );
}

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

  const overview = useQuery({
    queryKey: [...qk.security, "overview"],
    queryFn: () => api.get<SecurityOverview>("/security/overview"),
  });

  const list = useQuery({
    queryKey: [...qk.security, "events", tab.id, severity, status, page],
    queryFn: () =>
      tab.id === "fraud"
        ? api.get<Paged<SecurityEvent>>("/security/fraud-alerts", { query: { severity, status, page, page_size: PAGE_SIZE } })
        : api.get<Paged<SecurityEvent>>("/security/events", {
            query: { category: tab.category, severity, status, page, page_size: PAGE_SIZE },
          }),
    placeholderData: (prev) => prev,
  });

  const o = overview.data;
  const highCrit = (o?.by_severity.HIGH ?? 0) + (o?.by_severity.CRITICAL ?? 0);

  const columns: Column<SecurityEvent>[] = [
    { key: "sev", header: "Severity", cell: (e) => <SeverityBadge severity={e.severity} /> },
    {
      key: "type",
      header: "Type",
      className: "whitespace-normal",
      cell: (e) => (
        <div className="min-w-0">
          <div className="font-medium">{humanize(e.event_type)}</div>
          <div className="text-xs text-muted-foreground">{humanize(e.category)}</div>
        </div>
      ),
    },
    {
      key: "desc",
      header: "Description",
      className: "hidden min-w-56 whitespace-normal md:table-cell",
      cell: (e) => <span className="line-clamp-2 text-sm text-muted-foreground">{e.description}</span>,
    },
    { key: "risk", header: "Risk", cell: (e) => <RiskScore value={e.risk_score} />, className: "hidden sm:table-cell" },
    { key: "det", header: "Detector", cell: (e) => <Detector value={e.detector} />, className: "hidden xl:table-cell" },
    { key: "status", header: "Status", cell: (e) => <StatusBadge status={e.status} /> },
    { key: "time", header: "Time", cell: (e) => <TimeAgo date={e.created_at} className="text-sm" />, className: "hidden sm:table-cell" },
  ];

  return (
    <>
      <PageHeader
        title="Security"
        description="Fraud alerts, prompt injection attempts, agent violations and access events. Updates live."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Open events" loading={overview.isLoading} value={formatNumber(o?.by_status.OPEN ?? 0)} definition="Events with status OPEN, not yet triaged by an analyst." />
        <KpiCard label="High or critical" loading={overview.isLoading} value={formatNumber(highCrit)} definition="All events with severity HIGH or CRITICAL, any status." />
        <KpiCard
          label="Injection attempts"
          loading={overview.isLoading}
          value={formatNumber(o?.by_category.PROMPT_INJECTION ?? 0)}
          definition="Messages flagged by the injection classifier before reaching any model."
        />
        <KpiCard label="Total events" loading={overview.isLoading} value={formatNumber(o?.total ?? 0)} definition="Every security event recorded, all categories." />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Panel title="Breakdown" className="lg:col-span-2">
          {overview.error ? (
            <p className="text-sm text-danger-text">Overview unavailable.</p>
          ) : (
            <div className="space-y-5">
              <Breakdown title="By severity" data={o?.by_severity} order={SEVERITIES} render={(k) => <SeverityBadge severity={k} />} />
              <Breakdown title="By status" data={o?.by_status} order={STATUSES} render={(k) => <StatusBadge status={k} />} />
              <Breakdown title="By category" data={o?.by_category} render={(k) => humanize(k)} />
            </div>
          )}
        </Panel>
        <InjectionTester className="lg:col-span-3" />
      </div>

      <section className="mt-6" aria-label="Security events">
        <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <Tabs value={tab.id} onValueChange={(v) => setParam({ tab: v })} className="max-w-full overflow-x-auto overflow-y-hidden pb-1">
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t.id} value={t.id}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap gap-2">
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
          page={page}
          pageSize={PAGE_SIZE}
          total={list.data?.total}
          onPageChange={(p) => setParam({ page: String(p) })}
        />
      </section>
    </>
  );
}
