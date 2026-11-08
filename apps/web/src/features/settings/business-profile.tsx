"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, Award, Building2, Calendar, Check, Clock, ExternalLink, FileText, Globe, Hash, Loader2, Lock, MapPin, Phone, Quote, Receipt, Star, Users, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { api, request } from "@/lib/api";
import { can } from "@/lib/permissions";
import { useMe } from "@/lib/queries";
import type { BusinessPublic } from "@/lib/types";
import { cn } from "@/lib/utils";
import { errorText } from "@/features/security/shared";

export const businessProfileKey = ["settings", "business-profile"] as const;
type Form = Omit<BusinessPublic, "updated_at" | "accreditations"> & { accreditations: string };

type Field = { key: keyof Form; label: string; icon?: LucideIcon; span?: 2; area?: boolean; mono?: boolean; type?: string };
const FIELDS: Field[] = [
  { key: "name", label: "Brand name", icon: Building2 },
  { key: "legal_name", label: "Legal name", icon: FileText },
  { key: "tagline", label: "Tagline", icon: Quote, span: 2 },
  { key: "registration", label: "Registration no.", icon: Hash, mono: true },
  { key: "tax_id", label: "Tax ID", icon: Receipt, mono: true },
  { key: "address", label: "Address", icon: MapPin, span: 2 },
  { key: "city", label: "City", icon: MapPin },
  { key: "founded", label: "Founded", icon: Calendar, mono: true },
  { key: "phone", label: "Phone", icon: Phone, mono: true, type: "tel" },
  { key: "website", label: "Website", icon: Globe, mono: true },
  { key: "email", label: "Contact email", icon: AtSign, mono: true, type: "email" },
  { key: "support_email", label: "Support email", icon: AtSign, mono: true, type: "email" },
  { key: "support_hours", label: "Support hours", icon: Clock },
  { key: "learners", label: "Learners trained", icon: Users, mono: true },
  { key: "instructors", label: "Instructors", icon: Users, mono: true },
  { key: "rating", label: "Average rating", icon: Star, mono: true },
  { key: "accreditations", label: "Accreditations (one per line)", icon: Award, span: 2, area: true },
  { key: "about", label: "About", span: 2, area: true },
  { key: "refund_policy", label: "Refund policy", span: 2, area: true },
];

const toForm = (b: BusinessPublic): Form => ({ ...b, accreditations: b.accreditations.join("\n") });
const toBody = (f: Form) => ({ ...f, accreditations: f.accreditations.split("\n").map((s) => s.trim()).filter(Boolean) });

export function BusinessProfileTab() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: businessProfileKey, queryFn: () => api.get<BusinessPublic>("/settings/business-profile") });
  const [form, setForm] = useState<Form | null>(null);
  const [dirty, setDirty] = useState(false);
  const canEdit = can(me, "settings:write");

  useEffect(() => {
    // Reset the form whenever the server copy changes and the user has no unsaved edits.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (q.data && !dirty) setForm(toForm(q.data));
  }, [q.data, dirty]);

  const save = useMutation({
    mutationFn: (f: Form) => request<BusinessPublic>("PUT", "/settings/business-profile", toBody(f)),
    onSuccess: (b) => {
      qc.setQueryData(businessProfileKey, b);
      void qc.invalidateQueries({ queryKey: ["public", "business"] });
      void qc.invalidateQueries({ queryKey: ["audit"] });
      setDirty(false);
      toast.success("Business profile saved. Buyers see it now.");
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const set = (k: keyof Form, v: string) => {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    setDirty(true);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3.5 border-b border-hair px-5 py-[18px]">
        <div className="min-w-[200px] flex-1">
          <h3 className="text-base font-extrabold">Business profile</h3>
          <p className="mt-0.5 text-[13px] text-t3">What buyers see on the public site, at checkout and on receipts.</p>
        </div>
        <Link href="/" target="_blank" className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-hair bg-panel2 px-3 text-[13px] font-bold text-text no-underline hover:bg-panel3 hover:no-underline">
          <ExternalLink aria-hidden className="size-3.5" /> Preview public page
        </Link>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (form) save.mutate(form);
        }}
      >
        <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 px-5 py-[18px] sm:grid-cols-2">
          {!form &&
            FIELDS.map((f) => (
              <div key={f.key} className={cn("grid gap-1.5", f.span === 2 && "sm:col-span-2")}>
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className={f.area ? "h-20" : "h-11"} />
              </div>
            ))}
          {form &&
            FIELDS.map((f) => {
              const Icon = f.icon;
              const id = `biz-${f.key}`;
              return (
                <label key={f.key} htmlFor={id} className={cn("grid min-w-0 gap-1.5", f.span === 2 && "sm:col-span-2")}>
                  <span className="text-[12.5px] font-bold text-t2">{f.label}</span>
                  {f.area ? (
                    <textarea
                      id={id}
                      rows={3}
                      value={form[f.key]}
                      readOnly={!canEdit}
                      onChange={(e) => set(f.key, e.target.value)}
                      className="resize-y rounded-xl border border-hair2 bg-input px-3 py-2.5 text-sm leading-[1.5] text-text outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/35 read-only:text-t2"
                    />
                  ) : (
                    <span className="flex h-11 items-center gap-2 rounded-xl border border-hair2 bg-input px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/35">
                      {Icon && <Icon aria-hidden className="size-[15px] shrink-0 text-t4" />}
                      <input
                        id={id}
                        type={f.type ?? "text"}
                        value={form[f.key]}
                        readOnly={!canEdit}
                        required={f.key === "name"}
                        minLength={f.key === "name" ? 2 : undefined}
                        onChange={(e) => set(f.key, e.target.value)}
                        className={cn("min-w-0 flex-1 bg-transparent text-sm text-text outline-none read-only:text-t2", f.mono && "font-mono text-[13px]")}
                      />
                    </span>
                  )}
                </label>
              );
            })}
        </div>
        <div className="flex flex-wrap items-center gap-2.5 border-t border-hair px-5 py-3.5">
          <p className="min-w-[200px] flex-1 text-[12.5px] text-t3">Changes are visible to buyers immediately. Legal name and registration are shown on every receipt.</p>
          {canEdit ? (
            <button
              type="submit"
              disabled={!form || !dirty || save.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-[18px] text-[13.5px] font-extrabold text-on-brand disabled:opacity-60"
            >
              {save.isPending ? <Loader2 aria-hidden className="size-[15px] animate-spin" /> : <Check aria-hidden className="size-[15px]" strokeWidth={2.6} />}
              {save.isPending ? "Saving…" : "Save profile"}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-t3">
              <Lock aria-hidden className="size-3.5" /> Read-only · SUPER_ADMIN edits this
            </span>
          )}
        </div>
      </form>
    </>
  );
}
