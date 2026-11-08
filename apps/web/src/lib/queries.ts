"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { Approval, BuyerFlags, Paged, User } from "./types";

// Shared query keys. Event-driven invalidation in use-events.ts targets these roots.
export const qk = {
  me: ["me"] as const,
  agents: ["agents"] as const,
  workflows: ["workflows"] as const,
  payments: ["payments"] as const,
  orders: ["orders"] as const,
  analytics: ["analytics"] as const,
  security: ["security"] as const,
  approvals: ["approvals"] as const,
  customers: ["customers"] as const,
  products: ["products"] as const,
  conversations: ["conversations"] as const,
  events: ["events"] as const,
  strategy: ["strategy"] as const,
};

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: () => api.get<User>("/auth/me"),
    staleTime: 60_000,
    retry: false,
  });
}

/** Buy / sell switch flags for the signed-in user (keyed under `me`, so sign-out clears it). */
export function useBuyerFlags(enabled = true) {
  return useQuery({
    queryKey: [...qk.me, "flags"],
    queryFn: () => api.get<BuyerFlags>("/me/flags", { noAuthRedirect: true }),
    staleTime: 60_000,
    retry: false,
    enabled,
  });
}

export function usePendingApprovalsCount(enabled = true) {
  return useQuery({
    queryKey: [...qk.approvals, "pending-count"],
    queryFn: () => api.get<Paged<Approval> | Approval[]>("/approvals", { query: { status: "PENDING_REVIEW", page_size: 1 } }),
    select: (d) => (Array.isArray(d) ? d.length : d.total),
    enabled,
    refetchInterval: 30_000,
  });
}
