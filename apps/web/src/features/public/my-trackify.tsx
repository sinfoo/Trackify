"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MessageCircle, Printer, Receipt, Sparkles, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Pill, SimulatedBadge, TimeAgo, TonePill, type Tone } from "@/components/ui-kit";
import { ApiError } from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { BuyerAccount, BuyerEnrollment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { clearSession, loadSession, publicApi } from "./api";
import { useBusiness } from "./business";
import { EnrollButton, GHOST_BTN, PRIMARY_BTN, seatTone } from "./offers";
import { ProgressTracker } from "./progress-tracker";

export const accountKey = ["public", "account"] as const;

/** Null without a session (or when the stored one is stale). Polls every 10 s while a payment waits for a human. */
function useAccount() {
  return useQuery({
    queryKey: accountKey,
    queryFn: async (): Promise<BuyerAccount | null> => {
      const s = loadSession();
      if (!s) return null;
      try {
        return await publicApi.account(s);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          clearSession();
          return null;
        }
        throw e;
      }
    },
    retry: false,
    refetchInterval: (q) => (q.state.data?.enrollments.some((e) => e.payment?.status === "REQUIRES_APPROVAL") ? 10_000 : false),
  });
}

/** Payment status pill from payment.status, falling back to the order status. */
function statusPill(e: BuyerEnrollment): { label: string; tone: Tone } {
  const p = e.payment?.status ?? "";
  const o = e.order_status;
  if (p === "SUCCEEDED" || o === "PAID") return { label: "Paid", tone: "success" };
  if (p === "REQUIRES_APPROVAL") return { label: "Under review", tone: "warning" };
  if (p === "FAILED") return { label: "Payment failed", tone: "danger" };
  if (p === "BLOCKED") return { label: "Blocked", tone: "danger" };
  if (p === "REFUNDED" || o === "REFUNDED") return { label: "Refunded", tone: "info" };
  if (p === "CANCELLED" || o === "CANCELLED") return { label: "Cancelled", tone: "neutral" };
  return { label: "Pending", tone: "neutral" };
}

/** Labels for the API's fictional test methods (the checkout keeps the long "Test card · always succeeds" form). */
const METHOD_LABEL: Record<string, string> = {
  sim_card_success: "Test card",
  sim_wallet_success: "Test e-wallet",
  sim_card_declined: "Test card (declined)",
  sim_insufficient_funds: "Test card (insufficient funds)",
  sim_provider_error: "Test card (provider error)",
};

const ACTION = "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-3.5 text-[13.5px] font-extrabold no-underline hover:no-underline [&_svg]:size-[15px]";
const ACTION_GHOST = cn(ACTION, "border border-hair bg-panel2 text-text hover:bg-panel3");
const ACTION_PRIMARY = cn(ACTION, "bg-brand text-on-brand");

/* Print: only the receipt that was asked for, in light-theme ink. `visibility` hides every other element without reflow. */
const PRINT_CSS = `@media print{html,body{background:#fff!important}body *{visibility:hidden}.print-receipt,.print-receipt *{visibility:visible}.print-receipt{position:absolute;top:0;left:0;width:100%;margin:0;padding:24px;border:0;box-shadow:none;background:#fff}.print-receipt *{color:#0f1a33!important;border-color:#cbd2df!important;background:transparent!important}}`;

export function MyTrackify() {
  const { data, isLoading, error, refetch } = useAccount();
  const name = data?.customer.full_name?.trim();
  return (
    <div className="anim-rise mx-auto w-full max-w-[1180px] px-6 pt-12 pb-[72px]">
      <style>{PRINT_CSS}</style>
      <p className="eyebrow font-extrabold text-brand-text">Your space</p>
      <h1 className="mt-1 text-4xl leading-[1.1] font-extrabold tracking-[-.03em]">
        My Trackify{name ? <span className="font-semibold text-t2">, hi {name}</span> : null}
      </h1>
      <p className="mt-2.5 max-w-[640px] text-base text-t3">Everything the assistant recommended, what you enrolled in, and where each enrollment stands.</p>

      {error ? (
        <ErrorState className="mt-8" error={error} title="Could not load your space" onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="mt-8 grid gap-3.5" aria-busy>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-[220px] w-full rounded-[22px]" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-[260px] w-full rounded-[22px]" />
        </div>
      ) : !data ? (
        <EmptyState
          className="mx-auto mt-10 max-w-[560px]"
          icon={MessageCircle}
          title="Nothing here yet"
          description="Start a conversation with the assistant to see your recommendations and enrollments here."
          action={
            <Link href="/assistant" className={PRIMARY_BTN}>
              <MessageCircle aria-hidden /> Talk to the assistant
            </Link>
          }
        />
      ) : (
        <>
          <section aria-labelledby="rec-h" className="mt-10">
            <h2 id="rec-h" className="text-[22px] font-extrabold tracking-[-.02em]">
              Recommended for you
            </h2>
            {data.recommended.length ? (
              <ul className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-3.5">
                {data.recommended.map((o) => (
                  <li key={o.id} className="flex flex-col gap-3.5 rounded-[22px] border border-hair bg-panel p-5 shadow-card">
                    <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-t3">
                      <Sparkles aria-hidden className="size-3.5 text-brand-text" strokeWidth={2.2} />
                      Recommended by the assistant · <TimeAgo date={o.recommended_at} />
                      {o.pitched && (
                        <Pill tone="warning" size="sm">
                          Suggested for you
                        </Pill>
                      )}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11.5px] font-extrabold tracking-[.06em] uppercase text-t4">{o.category}</span>
                      <span className={cn("inline-flex h-6 items-center gap-[5px] rounded-full px-[9px] text-[11.5px] font-extrabold whitespace-nowrap", seatTone(o.seats_left))}>
                        <Users aria-hidden className="size-3" strokeWidth={2.4} />
                        {o.seats_left} seats left
                      </span>
                    </div>
                    <h3 className="text-[19px] leading-[1.2] font-extrabold tracking-[-.02em]">{o.name}</h3>
                    <p className="flex-1 text-[13.5px] leading-[1.5] text-t3">{o.summary}</p>
                    <p className="text-[12.5px] text-t3">
                      {o.duration_weeks} weeks · {o.level}
                    </p>
                    <span className="tabular block text-2xl font-extrabold tracking-[-.03em]">
                      {formatMoney(o.price, "", { trim: true })} <span className="text-[13px] font-semibold text-t3">{o.currency}</span>
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <Link href={`/offers/${o.slug}`} className={cn(GHOST_BTN, "h-[50px] px-3")}>
                        View details
                      </Link>
                      <EnrollButton offer={o} className="px-3" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-[22px] border border-dashed border-hair2 bg-panel px-5 py-6 text-sm text-t3">
                No recommendation yet. Ask the assistant which program fits you.{" "}
                <Link href="/assistant" className="font-bold text-brand-text">
                  Open the assistant
                </Link>
              </p>
            )}
          </section>

          <section aria-labelledby="enr-h" className="mt-12">
            <h2 id="enr-h" className="text-[22px] font-extrabold tracking-[-.02em]">
              Your enrollments
            </h2>
            {data.enrollments.length ? (
              <ul className="mt-4 grid gap-3.5">
                {[...data.enrollments]
                  .sort((a, b) => b.created_at.localeCompare(a.created_at))
                  .map((e) => (
                    <EnrollmentCard key={e.order_id} e={e} />
                  ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-[22px] border border-dashed border-hair2 bg-panel px-5 py-6 text-sm text-t3">
                No enrollment yet. Enroll from a recommendation above or from{" "}
                <Link href="/offers" className="font-bold text-brand-text">
                  the programs
                </Link>
                .
              </p>
            )}
          </section>

          <p className="mt-10 text-[13px] leading-[1.5] text-t4">
            Confirmations are posted in your conversation. No real email is sent in this demo.
            {data.customer.email && (
              <>
                {" "}
                Email on file: <span className="font-semibold text-t3">{data.customer.email}</span>.
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}

function EnrollmentCard({ e }: { e: BuyerEnrollment }) {
  const [open, setOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const { biz } = useBusiness();
  const st = statusPill(e);
  const pay = e.payment;
  const paid = st.label === "Paid";
  const ask = `/assistant?q=${encodeURIComponent(`Tell me more about ${e.product.name}`)}`;
  const receiptId = `receipt-${e.order_id}`;

  // Print on the frame after the receipt got its .print-receipt class; clear it when the dialog closes.
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    const t = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(t);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  const rows: [string, string, boolean][] = [
    ["Program", `${e.product.name} · ${e.product.duration_weeks} weeks · ${e.product.level}`, false],
    ["Amount", formatMoney(e.amount, e.currency, { trim: true }), true],
    ["Order", e.order_reference, true],
    ["Transaction", pay?.transaction_reference ?? "-", true],
    ["Paid", pay?.paid_at ? formatDateTime(pay.paid_at) : "-", false],
    ["Method", pay?.method ? (METHOD_LABEL[pay.method] ?? pay.method) : "-", false],
    ["Seller", `${biz.legal_name} · ${biz.registration}`, false],
  ];

  return (
    <li className="rounded-[22px] border border-hair bg-panel p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg leading-[1.2] font-extrabold tracking-[-.02em]">{e.product.name}</h3>
            <Pill size="sm">{e.product.category}</Pill>
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-t3">
            <span className="mono font-semibold text-t2">{e.order_reference}</span>
            <span aria-hidden>·</span>
            <time dateTime={e.created_at}>{formatDateTime(e.created_at)}</time>
            <span aria-hidden>·</span>
            <span className="tabular font-bold text-text">{formatMoney(e.amount, e.currency, { trim: true })}</span>
          </p>
        </div>
        <TonePill tone={st.tone} label={st.label} size="lg" weight={800} />
      </div>

      <ProgressTracker steps={e.progress} className="mt-5" />

      {pay?.failure_reason && st.tone === "danger" && (
        <p className="mt-4 rounded-xl bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger">
          Reason: {pay.failure_reason.replace(/_/g, " ")}. Nothing was charged.
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {pay?.checkout_open && (
          <Link href={`/checkout/${encodeURIComponent(pay.session_id)}`} className={ACTION_PRIMARY}>
            Resume checkout <ArrowRight aria-hidden strokeWidth={2.4} />
          </Link>
        )}
        {paid && (
          <button type="button" className={ACTION_GHOST} aria-expanded={open} aria-controls={receiptId} onClick={() => setOpen((v) => !v)}>
            <Receipt aria-hidden /> {open ? "Hide receipt" : "View receipt"}
          </button>
        )}
        <Link href={ask} className={ACTION_GHOST}>
          <MessageCircle aria-hidden /> Ask the assistant about this program
        </Link>
        <Link href={`/offers/${e.product.slug}`} className={ACTION_GHOST}>
          Program details
        </Link>
      </div>

      {paid && open && (
        <section id={receiptId} aria-label={`Receipt ${e.order_reference}`} className={cn("mt-4 rounded-2xl border border-hair bg-bg p-5", printing && "print-receipt")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[15px] font-extrabold">Receipt</p>
            <SimulatedBadge label="Simulated payment" />
          </div>
          <dl className="mt-3.5 grid gap-2.5 text-[13.5px]">
            {rows.map(([l, v, mono]) => (
              <div key={l} className="flex justify-between gap-4 border-t border-hair pt-2.5">
                <dt className="shrink-0 text-t3">{l}</dt>
                <dd className={cn("text-right font-bold [overflow-wrap:anywhere]", mono && "mono")}>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-t4">
            {biz.name} · {biz.address} · {biz.support_email}. No real money moved and no card data was collected.
          </p>
          <button type="button" className={cn(ACTION_GHOST, "mt-4 print:hidden")} onClick={() => setPrinting(true)}>
            <Printer aria-hidden /> Print receipt
          </button>
        </section>
      )}
    </li>
  );
}
