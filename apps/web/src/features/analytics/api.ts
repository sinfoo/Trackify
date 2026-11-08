"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/queries";
import type { AnalyticsFilters, ConversionFunnel, Money, OverviewKpis, Product, RevenuePoint, Severity } from "@/lib/types";

// Response shapes as implemented in apps/api/app/services/analytics.py (ARCHITECTURE.md leaves most of these open).
export interface ProductRow {
  product_id: string;
  name: string;
  category: string;
  price: Money;
  status: string;
  revenue: Money;
  sales: number;
  failed: number;
  /** 0-100, null when no attempts. */
  payment_success_rate: number | null;
  seats_taken: number;
  seats_total: number;
}
export interface PaymentsAnalytics {
  counts: Record<string, number>;
  revenue: Money;
  refunded: Money;
  currency: string;
  avg_transaction_value: Money;
  pending_payments: number;
  series: RevenuePoint[];
}
export interface CustomersAnalytics {
  sentiment: Record<string, number>;
  interests: { interest: string; count: number }[];
  intent: { band: string; count: number }[];
  objections: { objection: string; count: number; share: number }[];
  segments: { segment: string | null; count: number }[];
}
export type SecurityPoint = { date: string } & Record<Severity, number>;
export interface SecurityAnalytics {
  series: SecurityPoint[];
  by_category: Record<string, number>;
}
export interface AgentStat {
  agent_id: string;
  succeeded: number;
  failed: number;
  avg_ms: number;
}
export interface Snapshot {
  id: string;
  metrics: Record<string, unknown>;
  narrative: string;
  trigger: string;
  created_at: string;
}

export const SEGMENTS = ["student", "professional", "career_switcher", "company", "individual"] as const;

// Definitions the backend does not serve yet; backend values win when present.
const FALLBACK_DEFS: Record<string, string> = {
  payments_succeeded: "Simulated transactions with status SUCCEEDED in the period.",
  payments_failed: "Simulated transactions with status FAILED in the period.",
  pending_payments: "Transactions not yet settled: CREATED, PENDING, PROCESSING or REQUIRES_APPROVAL.",
  refunded: "Sum of transactions refunded after human approval. Excluded from revenue.",
  high_risk_events: "Security events with HIGH or CRITICAL severity in the period.",
};

const useA = <T,>(name: string, f: AnalyticsFilters, enabled = true) =>
  useQuery({
    queryKey: [...qk.analytics, name, f],
    queryFn: () => api.get<T>(`/analytics/${name}`, { query: { ...f } }),
    enabled,
  });

export const useOverview = (f: AnalyticsFilters = {}) => useA<OverviewKpis>("overview", f);
export const useRevenue = (f: AnalyticsFilters = {}) => useA<RevenuePoint[]>("revenue", f);
export const useConversion = (f: AnalyticsFilters = {}) => useA<ConversionFunnel>("conversion", f);
export const useProductStats = (f: AnalyticsFilters = {}) => useA<ProductRow[]>("products", f);
export const usePaymentStats = (f: AnalyticsFilters = {}) => useA<PaymentsAnalytics>("payments", f);
export const useCustomerStats = (f: AnalyticsFilters = {}) => useA<CustomersAnalytics>("customers", f);
export const useSecurityStats = (f: AnalyticsFilters = {}) => useA<SecurityAnalytics>("security", f);
export const useAgentStats = (f: AnalyticsFilters = {}) => useA<AgentStat[]>("agents", f);
export type Forecast = {
  method: string;
  history_days: number;
  slope_per_day?: number;
  r2: number | null;
  points: { date: string; revenue: string }[];
  total: string;
  note: string;
};
export type FeedbackStats = {
  count: number;
  average: number | null;
  distribution: Record<string, number>;
  low_ratings: number;
  negative_comments: number;
  themes: { theme: string; count: number }[];
};
export const useForecast = () => useA<Forecast>("forecast", {});
export const useFeedback = (f: AnalyticsFilters = {}) => useA<FeedbackStats>("feedback", f);
export const useSnapshot = () => useA<Snapshot | null>("snapshots/latest", {});

/** Metric definitions keyed like the overview fields. Never empty: local fallbacks fill gaps or a failed fetch. */
export function useDefinitions(): Record<string, string> {
  const q = useQuery({
    queryKey: [...qk.analytics, "definitions"],
    queryFn: () => api.get<Record<string, string>>("/analytics/definitions"),
    staleTime: Infinity,
  });
  return { ...FALLBACK_DEFS, ...q.data };
}

export function useProducts() {
  return useQuery({ queryKey: qk.products, queryFn: () => api.get<Product[]>("/products"), staleTime: 60_000 });
}
