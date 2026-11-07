"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/queries";
import type { AgentView } from "@/lib/types";

export function useAgents(refetchInterval?: number) {
  return useQuery({
    queryKey: qk.agents,
    queryFn: () => api.get<AgentView[]>("/agents"),
    refetchInterval,
  });
}

/** Display status: disabled wins, then live activity (status RUNNING or a replayed agent.* event), then backend status. */
export function displayStatus(a: Pick<AgentView, "enabled" | "status">, active: boolean) {
  if (!a.enabled) return "DISABLED";
  if (active || a.status === "RUNNING") return "RUNNING";
  return a.status || "IDLE";
}
