"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { AGENT_META, AgentAvatar, ErrorState } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { can } from "@/lib/permissions";
import { qk, useMe } from "@/lib/queries";
import type { AgentView, AppSettings } from "@/lib/types";
import { errorText } from "@/features/security/shared";

const PROVIDERS = ["mock", "anthropic", "openai", "gemini"] as const;
const ORDER = ["sales", "intelligence", "payment", "analyst", "strategy", "security"];
const GLOBAL = "global";

type Patch = { provider?: string | null; model?: string | null; temperature?: number; enabled?: boolean };

export function ProvidersTab({ settings }: { settings?: AppSettings }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const agents = useQuery({ queryKey: qk.agents, queryFn: () => api.get<AgentView[]>("/agents") });
  const canWrite = can(me, "agents:write");
  const ai = settings?.ai;

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Patch }) => api.patch<AgentView>(`/agents/${id}/config`, body),
    onSuccess: (a) => {
      qc.setQueryData<AgentView[]>(qk.agents, (list) => list?.map((x) => (x.id === a.id ? a : x)));
      toast.success(`${AGENT_META[a.id]?.full ?? a.id} updated`);
    },
    onError: (e) => toast.error(errorText(e)),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.agents }),
  });

  const rows = [...(agents.data ?? [])].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  const configured = ai ? [ai.anthropic_configured && "Anthropic", ai.openai_configured && "OpenAI", ai.gemini_configured && "Gemini"].filter(Boolean) : [];

  return (
    <>
      <div className="border-b border-hair px-5 py-[18px]">
        <h3 className="text-base font-extrabold">AI providers</h3>
        <p className="mt-0.5 text-[13px] text-t3">Per agent. If a provider fails or times out, the agent falls back to its rules engine. Model output never controls state or permissions.</p>
      </div>
      {agents.isLoading && (
        <div className="grid gap-3 p-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      )}
      {agents.error && (
        <div className="p-5">
          <ErrorState error={agents.error} onRetry={() => agents.refetch()} />
        </div>
      )}
      <ul>
        {rows.map((a) => (
          <ProviderRow key={a.id} agent={a} globalProvider={ai?.provider} globalModel={ai?.default_model} canWrite={canWrite} busy={patch.isPending && patch.variables?.id === a.id} onPatch={(body) => patch.mutate({ id: a.id, body })} />
        ))}
      </ul>
      <p className="flex items-start gap-2 border-t border-hair px-5 py-3.5 text-[12.5px] text-t3">
        <KeyRound aria-hidden className="mt-0.5 size-3.5 shrink-0 text-brand-text" />
        <span>
          <span className="font-extrabold text-text">Keys stay on the server. </span>
          The API only reports whether a key is configured
          {ai ? ` (${configured.length ? configured.join(", ") : "none"} configured · default provider ${ai.provider})` : ""}. Set ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY on the API and restart it.
          {!canWrite && " Changing a provider needs agents:write."}
        </span>
      </p>
    </>
  );
}

function ProviderRow({ agent: a, globalProvider, globalModel, canWrite, busy, onPatch }: { agent: AgentView; globalProvider?: string; globalModel?: string; canWrite: boolean; busy: boolean; onPatch: (body: Patch) => void }) {
  const [model, setModel] = useState(a.model ?? "");
  const [temp, setTemp] = useState(a.temperature);
  const provider = a.provider ?? GLOBAL;
  const llm = (a.provider ?? globalProvider) !== "mock";
  const dis = !canWrite || busy;
  return (
    <li className="grid grid-cols-1 items-center gap-3 border-t border-hair px-5 py-3 md:grid-cols-[minmax(140px,1.6fr)_minmax(120px,1.4fr)_minmax(100px,1fr)_minmax(90px,1fr)_48px] md:gap-3.5">
      <span className="flex items-center gap-2.5">
        <AgentAvatar agentId={a.id} size={32} />
        <span className="text-sm font-bold">{AGENT_META[a.id]?.full ?? a.name}</span>
      </span>
      <Select value={provider} onValueChange={(v) => onPatch({ provider: v === GLOBAL ? null : v })} disabled={dis}>
        <SelectTrigger aria-label={`Provider for ${a.name}`} className="h-[34px] w-full rounded-[10px] border-hair2 text-[13px] font-semibold">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={GLOBAL}>Global ({globalProvider ?? "default"})</SelectItem>
          {PROVIDERS.map((p) => (
            <SelectItem key={p} value={p}>
              {p === "mock" ? "Rules only" : p.charAt(0).toUpperCase() + p.slice(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <input
        aria-label={`Model for ${a.name}`}
        value={model}
        placeholder={globalModel || "default model"}
        readOnly={dis}
        onChange={(e) => setModel(e.target.value)}
        onBlur={() => model !== (a.model ?? "") && onPatch({ model: model.trim() || null })}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="num h-[34px] min-w-0 rounded-[10px] border border-hair2 bg-input px-2.5 text-xs text-t2 outline-none placeholder:text-t4 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/35 read-only:border-transparent read-only:bg-transparent"
      />
      <label className="flex items-center gap-2 text-xs text-t3">
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={temp}
          disabled={dis}
          aria-label={`Temperature for ${a.name}`}
          onChange={(e) => setTemp(Number(e.target.value))}
          onPointerUp={() => temp !== a.temperature && onPatch({ temperature: temp })}
          onKeyUp={() => temp !== a.temperature && onPatch({ temperature: temp })}
          className="h-1 min-w-0 flex-1 accent-[var(--brand)]"
        />
        <span className="num w-7 text-right">{temp.toFixed(1)}</span>
      </label>
      <span className="flex justify-end" title={llm ? "LLM enabled" : "Rules only"}>
        <Switch aria-label={`${a.name} enabled`} checked={a.enabled} disabled={dis} onCheckedChange={(c) => onPatch({ enabled: c })} />
      </span>
    </li>
  );
}
