"use client";

import { BadgeCheck, Building2, Clock, FileBadge, Mail, MapPin, Phone, RotateCcw, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/shell/logo";
import { cn } from "@/lib/utils";
import { refundShort, useBusiness } from "./business";

/** Landing: "Who you are buying from" (panel band, 2 columns). */
export function WhoYouAreBuyingFrom() {
  const { biz } = useBusiness();
  const stats: [string, string][] = [
    ["Founded", biz.founded],
    ["Learners trained", biz.learners],
    ["Instructors", biz.instructors],
    ["Rating", `${biz.rating} / 5`],
  ];
  const rows: [string, string, LucideIcon, boolean][] = [
    ["Legal name", biz.legal_name, Building2, false],
    ["Registration", `${biz.registration} · tax ${biz.tax_id}`, FileBadge, true],
    ["Address", biz.address, MapPin, false],
    ["Phone", biz.phone, Phone, true],
    ["Email", `${biz.email} · ${biz.support_email}`, Mail, false],
    ["Support hours", biz.support_hours, Clock, false],
  ];
  return (
    <section aria-labelledby="biz-h" className="border-t border-hair bg-panel">
      <div className="mx-auto grid max-w-[1180px] grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-start gap-10 px-6 py-14">
        <div>
          <p className="eyebrow font-extrabold text-brand-text">Who you are buying from</p>
          <h2 id="biz-h" className="headline-lg mt-1.5 text-[32px] leading-[1.1]">
            {biz.name}
          </h2>
          <p className="mt-1.5 text-[15px] font-semibold text-t3">{biz.tagline}</p>
          <p className="mt-4 max-w-[560px] text-[15.5px] leading-[1.6] text-t2">{biz.about}</p>
          <ul className="mt-5 flex flex-wrap gap-2" aria-label="Accreditations">
            {biz.accreditations.map((a) => (
              <li key={a} className="inline-flex h-8 items-center gap-[7px] rounded-full bg-success-bg px-3 text-[12.5px] font-bold text-success">
                <BadgeCheck aria-hidden className="size-3.5" strokeWidth={2.2} />
                {a}
              </li>
            ))}
          </ul>
          <dl className="mt-[22px] grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-3">
            {stats.map(([l, v]) => (
              <div key={l} className="rounded-2xl border border-hair bg-panel2 px-3.5 py-3">
                <dt className="text-[11px] font-bold tracking-[.07em] uppercase text-t4">{l}</dt>
                <dd className="tabular mt-1 text-[22px] font-extrabold tracking-[-.02em]">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="grid gap-3.5 rounded-[26px] border border-hair bg-bg p-[22px]">
          <p className="eyebrow">Business details</p>
          {rows.map(([l, v, Icon, mono]) => (
            <div key={l} className="flex items-start gap-3 border-t border-hair pt-3">
              <span className="grid size-[34px] shrink-0 place-items-center rounded-[11px] bg-panel3">
                <Icon aria-hidden className="size-[15px] text-t2" strokeWidth={2} />
              </span>
              <span className="min-w-0">
                <span className="block text-[11.5px] font-bold text-t4">{l}</span>
                <span className={cn("mt-0.5 block text-sm leading-[1.4] font-semibold", mono && "mono")}>{v}</span>
              </span>
            </div>
          ))}
          <div className="flex items-start gap-2.5 rounded-2xl bg-brand-bg px-3.5 py-3">
            <RotateCcw aria-hidden className="mt-0.5 size-[15px] shrink-0 text-brand-text" strokeWidth={2.2} />
            <p className="text-[13px] leading-[1.5] text-text">
              <span className="font-extrabold text-brand-text">Refund policy.</span> {biz.refund_policy}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Program detail: "Offered by" card under the price card. */
export function OfferedBy({ className }: { className?: string }) {
  const { biz } = useBusiness();
  const mini: [string, LucideIcon, boolean][] = [
    [biz.address, MapPin, false],
    [biz.phone, Phone, true],
    [biz.support_email, Mail, false],
    [biz.registration, FileBadge, true],
  ];
  return (
    <div className={cn("rounded-[22px] border border-hair bg-panel px-5 py-[18px] shadow-card", className)}>
      <p className="eyebrow">Offered by</p>
      <div className="mt-2.5 flex items-center gap-3">
        <Logo compact size={40} href={null} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[15px] font-extrabold">
            {biz.name}
            <BadgeCheck aria-label="Verified" className="size-[15px] text-success" strokeWidth={2.4} />
          </span>
          <span className="block text-[12.5px] text-t3">
            {biz.legal_name} · since {biz.founded}
          </span>
        </span>
      </div>
      <dl className="mt-3.5 grid gap-2 text-[13px]">
        {mini.map(([v, Icon, mono]) => (
          <div key={v} className="flex items-start gap-2.5">
            <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-t4" strokeWidth={2} />
            <dd className={cn("leading-[1.45] text-t2", mono && "mono")}>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-hair pt-2.5 text-[12.5px] leading-[1.5] text-t3">
        <span className="font-extrabold text-text">14-day refund.</span> {refundShort(biz)}
      </p>
    </div>
  );
}

/** Checkout order summary tail: "You are buying from". */
export function BuyingFrom() {
  const { biz } = useBusiness();
  return (
    <div className="mt-4 border-t border-hair pt-3.5">
      <p className="eyebrow">You are buying from</p>
      <p className="mt-2 flex items-center gap-1.5 text-[14.5px] font-extrabold">
        {biz.name}
        <BadgeCheck aria-label="Verified" className="size-3.5 text-success" strokeWidth={2.4} />
      </p>
      <p className="text-[12.5px] leading-[1.5] text-t3">
        {biz.legal_name} · {biz.registration}
        <br />
        {biz.address}
      </p>
      <p className="mt-1.5 text-[12.5px] text-t3">
        Questions:{" "}
        <a href={`mailto:${biz.support_email}`} className="font-bold">
          {biz.support_email}
        </a>{" "}
        · {biz.phone}
      </p>
      <p className="mt-2 text-[12.5px] leading-[1.5] text-t3">
        <span className="font-bold text-text">Refunds:</span> {refundShort(biz)}
      </p>
    </div>
  );
}
