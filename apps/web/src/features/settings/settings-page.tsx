"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Check, KeyRound, Lock, Minus, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgentAvatar, ErrorState, Money, PageHeader, SimulatedBadge, StatusBadge, TimeAgo, humanize } from "@/components/ui-kit";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { can } from "@/lib/permissions";
import { qk, useMe } from "@/lib/queries";
import type { AgentView, AppSettings, Permission } from "@/lib/types";
import { DetailList, JsonView, Notice, Panel } from "@/features/security/shared";
import { NotificationsTab, VoiceTab } from "./preferences";
import { UsersTab, useRoles } from "./users-tab";

const TABS = [
  ["profile", "Profile"],
  ["users", "Users"],
  ["roles", "Roles & permissions"],
  ["ai", "AI providers"],
  ["voice", "Voice"],
  ["payments", "Payment simulation"],
  ["notifications", "Notifications"],
  ["health", "System health"],
] as const;

const Chip = ({ children }: { children: string }) => (
  <span className="num rounded-md border bg-muted/50 px-1.5 py-0.5 text-xs">{children}</span>
);

function NeedPerm({ perm }: { perm: string }) {
  return (
    <Notice icon={Lock} tone="neutral" title={`Requires ${perm}`}>
      Your role cannot view this section. The server enforces this; the UI only reflects it.
    </Notice>
  );
}

function useSettings(enabled: boolean) {
  return useQuery({ queryKey: ["settings", "system"], queryFn: () => api.get<AppSettings>("/settings"), enabled });
}

function ProfileTab() {
  const { data: me } = useMe();
  if (!me) return <Skeleton className="h-48" />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Your account">
        <DetailList
          items={[
            ["Name", me.full_name],
            ["Email", <span key="e" className="num text-xs">{me.email}</span>],
            ["Roles", <span key="r" className="flex flex-wrap gap-1">{me.roles.map((r) => <Chip key={r}>{r}</Chip>)}</span>],
            ["Status", <StatusBadge key="s" status={me.is_active ? "SUCCEEDED" : "DISABLED"} label={me.is_active ? "Active" : "Inactive"} />],
            ["Last login", <TimeAgo key="l" date={me.last_login_at} />],
            ["Member since", <TimeAgo key="c" date={me.created_at} />],
          ]}
        />
        <p className="mt-4 text-xs text-muted-foreground">
          Sessions use a 15 minute httpOnly cookie with rotating refresh tokens. Passwords are hashed with Argon2id.
        </p>
      </Panel>
      <Panel title={`Effective permissions (${me.permissions.length})`}>
        <ul className="flex flex-wrap gap-1.5">
          {me.permissions.map((p) => (
            <li key={p}>
              <Chip>{p}</Chip>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          These are checked by the backend on every request. Hidden buttons are a convenience, not the control.
        </p>
      </Panel>
    </div>
  );
}

function RolesTab() {
  const roles = useRoles();
  const perms = useQuery({ queryKey: ["settings", "permissions"], queryFn: () => api.get<Permission[]>("/permissions") });
  if (roles.isLoading || perms.isLoading) return <Skeleton className="h-96" />;
  if (roles.error || perms.error)
    return <ErrorState error={roles.error ?? perms.error} onRetry={() => (roles.refetch(), perms.refetch())} />;
  const rs = roles.data ?? [];
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rs.map((r) => (
          <div key={r.name} className="rounded-xl border bg-card p-4">
            <p className="num text-sm font-semibold">{r.name}</p>
            <p className="text-sm text-muted-foreground">{r.description}</p>
            <p className="num mt-2 text-xs text-muted-foreground">{r.permissions.length} permissions</p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[44rem] text-sm">
          <caption className="sr-only">Permissions granted to each role</caption>
          <thead>
            <tr className="border-b">
              <th scope="col" className="sticky left-0 bg-card px-4 py-2.5 text-left font-medium">
                Permission
              </th>
              {rs.map((r) => (
                <th key={r.name} scope="col" className="num px-2 py-2.5 text-center text-xs font-medium">
                  {humanize(r.name)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(perms.data ?? []).map((p) => (
              <tr key={p.code} className="border-b last:border-0 hover:bg-muted/30">
                <th scope="row" className="sticky left-0 bg-card px-4 py-2 text-left font-normal">
                  <span className="num block text-xs font-medium">{p.code}</span>
                  <span className="text-xs text-muted-foreground">{p.description}</span>
                </th>
                {rs.map((r) => {
                  const has = r.permissions.includes(p.code);
                  return (
                    <td key={r.name} className="px-2 py-2 text-center">
                      {has ? (
                        <Check aria-label="Granted" className="mx-auto size-4 text-success-text" />
                      ) : (
                        <Minus aria-label="Not granted" className="mx-auto size-4 text-muted-foreground/50" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AiTab({ enabled }: { enabled: boolean }) {
  const s = useSettings(enabled);
  const agents = useQuery({ queryKey: qk.agents, queryFn: () => api.get<AgentView[]>("/agents") });
  const ai = s.data?.ai;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Provider">
          {s.isLoading ? (
            <Skeleton className="h-32" />
          ) : s.error || !ai ? (
            <ErrorState error={s.error} onRetry={() => s.refetch()} />
          ) : (
            <DetailList
              items={[
                ["Active provider", <span key="p" className="num font-medium">{ai.provider}</span>],
                ["Default model", <span key="m" className="num text-xs">{ai.default_model || "Set per agent (below)"}</span>],
                ["Anthropic", <StatusBadge key="a" status={ai.anthropic_configured ? "SUCCEEDED" : "DISABLED"} label={ai.anthropic_configured ? "Configured" : "Not configured"} />],
                ["OpenAI", <StatusBadge key="o" status={ai.openai_configured ? "SUCCEEDED" : "DISABLED"} label={ai.openai_configured ? "Configured" : "Not configured"} />],
                ["Environment", <span key="env" className="num text-xs">{s.data?.environment}</span>],
              ]}
            />
          )}
        </Panel>
        <Panel title="Keys stay on the server">
          <Notice icon={KeyRound} tone="info" title="No API key is ever sent to the browser">
            The API only reports whether a key is configured. Set these as environment variables on the API server and restart it:
          </Notice>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Chip>AI_PROVIDER</Chip> <span className="text-muted-foreground">anthropic, openai or mock (deterministic, offline)</span></li>
            <li><Chip>ANTHROPIC_API_KEY</Chip> <span className="text-muted-foreground">enables the Anthropic provider</span></li>
            <li><Chip>OPENAI_API_KEY</Chip> <span className="text-muted-foreground">enables the OpenAI provider</span></li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            If a provider fails, agents fall back to deterministic rules. LLM output never changes payment state or permissions.
          </p>
        </Panel>
      </div>
      <Panel title="Per-agent model configuration">
        {agents.isLoading ? (
          <Skeleton className="h-40" />
        ) : agents.error ? (
          <ErrorState error={agents.error} onRetry={() => agents.refetch()} />
        ) : (
          <ul className="divide-y">
            {(agents.data ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <Link href={`/agents/${a.id}`} className="flex items-center gap-3 hover:underline">
                  <AgentAvatar agentId={a.id} size="sm" />
                  <span className="font-medium">{a.name}</span>
                </Link>
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <Chip>{a.provider || `${ai?.provider ?? "global"} (global)`}</Chip>
                  <Chip>{a.model || "default model"}</Chip>
                  <span className="num text-xs text-muted-foreground">temp {a.temperature}</span>
                  <StatusBadge status={a.enabled ? "SUCCEEDED" : "DISABLED"} label={a.enabled ? "Enabled" : "Disabled"} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function PaymentsTab({ enabled }: { enabled: boolean }) {
  const s = useSettings(enabled);
  if (s.isLoading) return <Skeleton className="h-64" />;
  if (s.error || !s.data) return <ErrorState error={s.error} onRetry={() => s.refetch()} />;
  const p = s.data.payments as {
    provider?: string;
    currency?: string;
    high_value_threshold?: string;
    velocity_max_attempts?: number;
    velocity_window_minutes?: number;
    failed_attempts_threshold?: number;
    test_methods?: { id: string; label: string }[];
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Simulation" actions={<SimulatedBadge />}>
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
          <span className="flex items-center gap-2 font-medium">
            <Lock aria-hidden className="size-4" /> Live mode: off
          </span>
          <span className="text-xs text-muted-foreground">Locked. No live provider exists in this build.</span>
        </div>
        <DetailList
          items={[
            ["Provider", <span key="p" className="num text-xs">{p.provider ?? "-"}</span>],
            ["Currency", <span key="c" className="num">{p.currency ?? "TND"}</span>],
            ["High value hold", p.high_value_threshold ? <span key="h">From <Money value={p.high_value_threshold} currency={p.currency} /></span> : "-"],
            ["Velocity limit", <span key="v" className="num">{p.velocity_max_attempts ?? "-"} attempts / {p.velocity_window_minutes ?? "-"} min</span>],
            ["Failed attempts", <span key="f" className="num">{p.failed_attempts_threshold ?? "-"} before hold</span>],
          ]}
        />
      </Panel>
      <Panel title="Test methods">
        <ul className="space-y-2">
          {(p.test_methods ?? []).map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm">
              <span>{m.label}</span>
              <Chip>{m.id}</Chip>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">Fictional methods only. There are no card fields anywhere in the product.</p>
      </Panel>
    </div>
  );
}

function HealthTab() {
  const health = useQuery({ queryKey: ["settings", "health"], queryFn: () => api.get<Record<string, unknown>>("/health"), refetchInterval: 15_000 });
  const ready = useQuery({ queryKey: ["settings", "ready"], queryFn: () => api.get<Record<string, unknown>>("/health/ready"), refetchInterval: 15_000 });
  const card = (title: string, q: typeof health, okKey: string, okVal: string) => (
    <Panel
      title={title}
      actions={
        <Button variant="ghost" size="icon-sm" aria-label={`Recheck ${title}`} onClick={() => q.refetch()}>
          <RotateCw aria-hidden className={q.isFetching ? "animate-spin" : undefined} />
        </Button>
      }
    >
      {q.isLoading ? (
        <Skeleton className="h-20" />
      ) : (
        <div className="space-y-3">
          <StatusBadge status={!q.error && q.data?.[okKey] === okVal ? "SUCCEEDED" : "FAILED"} label={!q.error && q.data?.[okKey] === okVal ? "Healthy" : "Unhealthy"} />
          {q.error ? <p className="text-sm text-danger-text">{q.error.message}</p> : <JsonView value={q.data} />}
          {q.dataUpdatedAt > 0 && <p className="text-xs text-muted-foreground">Checked <TimeAgo date={new Date(q.dataUpdatedAt).toISOString()} />, every 15 s.</p>}
        </div>
      )}
    </Panel>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {card("API (GET /health)", health, "status", "ok")}
      {card("Database (GET /health/ready)", ready, "status", "ready")}
    </div>
  );
}

export function SettingsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: me } = useMe();
  const tab = TABS.find(([id]) => id === params.get("tab"))?.[0] ?? "profile";
  const settingsRead = can(me, "settings:read");
  const usersRead = can(me, "users:read");

  return (
    <>
      <PageHeader title="Settings" description="Your account, users, roles, AI providers and simulation settings." />
      <Tabs value={tab} onValueChange={(v) => router.replace(v === "profile" ? "/settings" : `/settings?tab=${v}`, { scroll: false })}>
        <div className="mb-4 max-w-full overflow-x-auto overflow-y-hidden pb-1">
          <TabsList>
            {TABS.map(([id, label]) => (
              <TabsTrigger key={id} value={id}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="profile"><ProfileTab /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="roles">{usersRead ? <RolesTab /> : <NeedPerm perm="users:read" />}</TabsContent>
        <TabsContent value="ai">{settingsRead ? <AiTab enabled /> : <NeedPerm perm="settings:read" />}</TabsContent>
        <TabsContent value="voice"><VoiceTab /></TabsContent>
        <TabsContent value="payments">{settingsRead ? <PaymentsTab enabled /> : <NeedPerm perm="settings:read" />}</TabsContent>
        <TabsContent value="notifications"><NotificationsTab /></TabsContent>
        <TabsContent value="health"><HealthTab /></TabsContent>
      </Tabs>
    </>
  );
}
