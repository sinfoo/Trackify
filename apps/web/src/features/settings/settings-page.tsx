"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Building2, FlaskConical, Lock, SlidersHorizontal, Sparkles, Users, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { can } from "@/lib/permissions";
import { useMe } from "@/lib/queries";
import type { AppSettings } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Notice, Page } from "@/features/security/shared";
import { BusinessProfileTab } from "./business-profile";
import { PreferencesTab } from "./preferences";
import { ProvidersTab } from "./providers";
import { SimulationTab } from "./simulation";
import { UsersTab } from "./users-tab";

const TABS: { id: string; label: string; icon: LucideIcon; perm?: string }[] = [
  { id: "users", label: "Users and roles", icon: Users },
  { id: "business", label: "Business profile", icon: Building2, perm: "settings:read" },
  { id: "providers", label: "AI providers", icon: Sparkles, perm: "settings:read" },
  { id: "sim", label: "Simulation and risk", icon: FlaskConical, perm: "settings:read" },
  { id: "prefs", label: "Preferences", icon: SlidersHorizontal },
];
// Old deep links (?tab=ai|payments|notifications|voice|profile|roles) keep working.
const ALIAS: Record<string, string> = { ai: "providers", payments: "sim", health: "sim", notifications: "prefs", voice: "prefs", profile: "prefs", roles: "users" };

export function SettingsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: me } = useMe();
  const raw = params.get("tab") ?? "users";
  const tab = TABS.find((t) => t.id === (ALIAS[raw] ?? raw))?.id ?? "users";
  const settingsRead = can(me, "settings:read");
  const settings = useQuery({ queryKey: ["settings", "system"], queryFn: () => api.get<AppSettings>("/settings"), enabled: settingsRead });
  const current = TABS.find((t) => t.id === tab)!;
  const allowed = !current.perm || can(me, current.perm);

  return (
    <Page title="Settings" description="Users, roles, AI providers and simulation settings. Keys stay on the server.">
      <div className="flex flex-wrap items-start gap-[18px]">
        <ul className="grid flex-[0_0_220px] content-start gap-1 max-sm:flex-[1_1_100%]" role="tablist" aria-label="Settings sections">
          {TABS.map((t) => {
            const Icon = t.icon;
            const on = t.id === tab;
            return (
              <li key={t.id} role="presentation">
                <button
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => router.replace(t.id === "users" ? "/settings" : `/settings?tab=${t.id}`, { scroll: false })}
                  className={cn("flex h-[42px] w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm transition-all duration-200 hover:bg-panel2", on ? "bg-panel font-extrabold text-text shadow-card" : "font-semibold text-t3")}
                >
                  <Icon aria-hidden className="size-4" />
                  {t.label}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="min-w-0 flex-[1_1_460px] overflow-hidden rounded-[22px] border border-hair bg-panel shadow-card" role="tabpanel">
          {!allowed ? (
            <div className="p-5">
              <Notice icon={Lock} tone="neutral" title={`Requires ${current.perm}.`}>
                Your role cannot view this section. The server enforces this; the UI only reflects it.
              </Notice>
            </div>
          ) : tab === "users" ? (
            <UsersTab />
          ) : tab === "business" ? (
            <BusinessProfileTab />
          ) : tab === "providers" ? (
            <ProvidersTab settings={settings.data} />
          ) : tab === "sim" ? (
            <SimulationTab settings={settings.data} loading={settings.isLoading} error={settings.error} retry={() => settings.refetch()} />
          ) : (
            <PreferencesTab />
          )}
        </div>
      </div>
    </Page>
  );
}
