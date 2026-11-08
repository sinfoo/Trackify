"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  CircleCheck,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  PackageOpen,
  Printer,
  Receipt,
  ReceiptText,
  Sparkles,
  Store,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Pill, SimulatedBadge, TimeAgo, TonePill, type Tone } from "@/components/ui-kit";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import type { BuyerDashboard as Dashboard, BuyerEnrollment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { buyerSignInUrl, publicApi } from "./api";
import { useBusiness } from "./business";
import { EnrollButton, GHOST_BTN, PRIMARY_BTN, seatTone } from "./offers";
import { ProgressTracker } from "./progress-tracker";

export const accountKey = ["me", "account"] as const;

/** Buyer dashboard query. Polls every 10 s while a payment waits for a human. 401/403 are rendered, never redirected. */
function useAccount() {
  return useQuery({
    queryKey: accountKey,
    queryFn: publicApi.account,
    retry: false,
    refetchInterval: (q) => (q.state.data?.orders.some((e) => e.payment?.status === "REQUIRES_APPROVAL") ? 10_000 : false),
  });
}

/** Payment status pill from payment.status, falling back to the order status. */
export function statusPill(e: BuyerEnrollment): { label: string; tone: Tone } {
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
const CARD = "rounded-[22px] border border-hair bg-panel p-5 shadow-card";
const H2 = "text-[22px] font-extrabold tracking-[-.02em]";
const NOTE = "mt-4 rounded-[22px] border border-dashed border-hair2 bg-panel px-5 py-6 text-sm text-t3";

/* Print: only the receipt that was asked for, in light-theme ink. `visibility` hides every other element without reflow. */
const PRINT_CSS = `@media print{html,body{background:#fff!important}body *{visibility:hidden}.print-receipt,.print-receipt *{visibility:visible}.print-receipt{position:absolute;top:0;left:0;width:100%;margin:0;padding:24px;border:0;box-shadow:none;background:#fff}.print-receipt *{color:#0f1a33!important;border-color:#cbd2df!important;background:transparent!important}}`;

const SECTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "library", label: "Library", icon: BookOpen },
  { id: "arriving", label: "In arrival", icon: PackageOpen },
  { id: "orders", label: "Orders & receipts", icon: ReceiptText },
  { id: "recommended", label: "Recommended", icon: Sparkles },
  { id: "profile", label: "Profile", icon: UserRound },
];

export function BuyerDashboard() {
  const { data, isLoading, error, refetch } = useAccount();
  const first = data?.user.full_name.trim().split(/\s+/)[0];

  let body: ReactNode;
  if (error instanceof ApiError && error.status === 401)
    body = (
      <EmptyState
        className="mx-auto mt-10 max-w-[560px]"
        icon={UserRound}
        title="Sign in to see your dashboard"
        description="Your library, orders, receipts and the programs the assistant recommended live here."
        action={
          <div className="flex flex-wrap justify-center gap-2.5">
            <Link href={buyerSignInUrl("/account")} className={PRIMARY_BTN}>
              Sign in <ArrowRight aria-hidden strokeWidth={2.4} />
            </Link>
            <Link href="/register?as=buyer&next=%2Faccount" className={cn(GHOST_BTN, "h-[50px]")}>
              Create a buyer account
            </Link>
          </div>
        }
      />
    );
  else if (error instanceof ApiError && error.status === 403)
    body = (
      <EmptyState
        className="mx-auto mt-10 max-w-[560px]"
        icon={UserRound}
        title="This account cannot buy programs"
        description="Staff accounts run the console. To enroll as a learner, create a separate buyer account."
        action={
          <Link href="/register?as=buyer&next=%2Faccount" className={PRIMARY_BTN}>
            Create a buyer account
          </Link>
        }
      />
    );
  else if (error) body = <ErrorState className="mt-8" error={error} title="Could not load your dashboard" onRetry={() => void refetch()} />;
  else if (isLoading || !data)
    body = (
      <div className="mt-8 grid gap-3.5" aria-busy>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-[220px] w-full rounded-[22px]" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-[260px] w-full rounded-[22px]" />
      </div>
    );
  else body = <Sections data={data} />;

  return (
    <div className="anim-rise mx-auto w-full max-w-[1180px] px-6 pt-12 pb-[72px]">
      <style>{PRINT_CSS}</style>
      <p className="eyebrow font-extrabold text-brand-text">Buying</p>
      <h1 className="mt-1 text-4xl leading-[1.1] font-extrabold tracking-[-.03em]">
        My dashboard{first ? <span className="font-semibold text-t2">, hi {first}</span> : null}
      </h1>
      <p className="mt-2.5 max-w-[640px] text-base text-t3">Your programs, what is on its way, every receipt, and what the assistant recommended.</p>
      {body}
    </div>
  );
}

function Sections({ data }: { data: Dashboard }) {
  const counts: Record<string, number> = {
    library: data.library.length,
    arriving: data.arriving.length,
    orders: data.orders.length,
    recommended: data.recommended.length,
  };
  const byNewest = (xs: BuyerEnrollment[]) => [...xs].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <div className="mt-8 grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
      {/* Rail on lg, scrollable tab row below. Anchors only: no scroll-spy needed for five sections. */}
      <nav aria-label="Dashboard sections" className="-mx-6 overflow-x-auto px-6 lg:sticky lg:top-[92px] lg:mx-0 lg:overflow-visible lg:px-0">
        <ul className="flex gap-1.5 lg:flex-col">
          {SECTIONS.map((s) => (
            <li key={s.id} className="shrink-0">
              <a
                href={`#${s.id}`}
                className="inline-flex h-11 items-center gap-2.5 rounded-xl border border-hair bg-panel px-3.5 text-[13.5px] font-bold whitespace-nowrap text-t2 no-underline hover:bg-panel2 hover:text-text hover:no-underline lg:w-full lg:border-0 lg:bg-transparent"
              >
                <s.icon aria-hidden className="size-4 shrink-0 text-t3" strokeWidth={2.2} />
                <span className="min-w-0 truncate">{s.label}</span>
                {counts[s.id] !== undefined && <span className="num ml-auto shrink-0 rounded-full bg-panel3 px-2 py-0.5 text-[11.5px] font-bold text-t2">{counts[s.id]}</span>}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0">
        <section id="library" aria-labelledby="lib-h" className="scroll-mt-24">
          <h2 id="lib-h" className={H2}>
            Library
          </h2>
          <p className="mt-1 text-[13.5px] text-t3">Programs you bought. Course access opens with the cohort.</p>
          {data.library.length ? (
            <ul className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-3.5">
              {byNewest(data.library).map((e) => (
                <LibraryCard key={e.order_id} e={e} />
              ))}
            </ul>
          ) : (
            <p className={NOTE}>
              Nothing bought yet. Pick a program from{" "}
              <Link href="/offers" className="font-bold text-brand-text">
                the catalog
              </Link>{" "}
              or ask the assistant which one fits you.
            </p>
          )}
        </section>

        <section id="arriving" aria-labelledby="arr-h" className="mt-12 scroll-mt-24">
          <h2 id="arr-h" className={H2}>
            In arrival
          </h2>
          <p className="mt-1 text-[13.5px] text-t3">Enrollments waiting on a payment or on a human review.</p>
          {data.arriving.length ? (
            <ul className="mt-4 grid gap-3.5">
              {byNewest(data.arriving).map((e) => (
                <ArrivingCard key={e.order_id} e={e} />
              ))}
            </ul>
          ) : (
            <p className={NOTE}>Nothing on its way. Paid programs move straight to your library.</p>
          )}
        </section>

        <section id="orders" aria-labelledby="ord-h" className="mt-12 scroll-mt-24">
          <h2 id="ord-h" className={H2}>
            Orders &amp; receipts
          </h2>
          {data.orders.length ? (
            <ul className="mt-4 grid gap-2.5">
              {byNewest(data.orders).map((e) => (
                <OrderRow key={e.order_id} e={e} />
              ))}
            </ul>
          ) : (
            <p className={NOTE}>No order yet.</p>
          )}
        </section>

        <section id="recommended" aria-labelledby="rec-h" className="mt-12 scroll-mt-24">
          <h2 id="rec-h" className={H2}>
            Recommended for you
          </h2>
          {data.recommended.length ? (
            <ul className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-3.5">
              {data.recommended.map((o) => (
                <li key={o.id} className={cn(CARD, "flex flex-col gap-3.5")}>
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
                    <EnrollButton offer={o} journey={data.journey} className="px-3" />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className={NOTE}>
              No recommendation yet. Ask the assistant which program fits you.{" "}
              <Link href="/assistant" className="font-bold text-brand-text">
                Open the assistant
              </Link>
            </p>
          )}
        </section>

        <Profile data={data} />

        <p className="mt-10 text-[13px] leading-[1.5] text-t4">Confirmations are posted in your conversation. No real email is sent in this demo.</p>
      </div>
    </div>
  );
}

function Header({ e, children }: { e: BuyerEnrollment; children?: ReactNode }) {
  const st = statusPill(e);
  return (
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
          {children}
        </p>
      </div>
      <TonePill tone={st.tone} label={st.label} size="lg" weight={800} />
    </div>
  );
}

const askUrl = (name: string) => `/assistant?q=${encodeURIComponent(`Tell me more about ${name}`)}`;

/** Library: a bought program with its outcomes, the "Open program" placeholder and the receipt. */
function LibraryCard({ e }: { e: BuyerEnrollment }) {
  const [open, setOpen] = useState(false);
  const receiptId = `receipt-lib-${e.order_id}`;
  return (
    <li className={cn(CARD, "flex flex-col")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[11.5px] font-extrabold tracking-[.06em] uppercase text-t4">{e.product.category}</span>
          <h3 className="mt-1 text-[19px] leading-[1.2] font-extrabold tracking-[-.02em]">{e.product.name}</h3>
          <p className="mt-1 text-[12.5px] text-t3">
            {e.product.duration_weeks} weeks · {e.product.level} · bought {formatDate(e.payment?.paid_at ?? e.created_at)}
          </p>
        </div>
        <TonePill tone="success" label="Enrolled" icon={CircleCheck} size="lg" weight={800} />
      </div>
      {e.product.summary && <p className="mt-3 text-[13.5px] leading-[1.5] text-t3">{e.product.summary}</p>}
      {e.product.learning_outcomes?.length ? (
        <ul className="mt-3.5 grid gap-1.5" aria-label="What you will be able to do">
          {e.product.learning_outcomes.map((x) => (
            <li key={x} className="flex gap-2 text-[13.5px] leading-[1.4] font-semibold">
              <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={2.2} />
              {x}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        <button type="button" className={ACTION_PRIMARY} onClick={() => toast.info("Course access opens with your cohort. The welcome pack is in your conversation.")}>
          <BookOpen aria-hidden /> Open program
        </button>
        <button type="button" className={ACTION_GHOST} aria-expanded={open} aria-controls={receiptId} onClick={() => setOpen((v) => !v)}>
          <Receipt aria-hidden /> {open ? "Hide receipt" : "Receipt"}
        </button>
        <Link href={askUrl(e.product.name)} className={ACTION_GHOST} aria-label={`Ask the assistant about ${e.product.name}`}>
          <MessageCircle aria-hidden /> Ask the assistant
        </Link>
        <Link href={`/offers/${e.product.slug}`} className={ACTION_GHOST}>
          Program details
        </Link>
      </div>
      {open && <ReceiptBlock e={e} id={receiptId} />}
    </li>
  );
}

/** In arrival: progress tracker + resume. */
function ArrivingCard({ e }: { e: BuyerEnrollment }) {
  const pay = e.payment;
  const st = statusPill(e);
  return (
    <li className={CARD}>
      <Header e={e} />
      <ProgressTracker steps={e.progress} className="mt-5" />
      {pay?.failure_reason && st.tone === "danger" && (
        <p className="mt-4 rounded-xl bg-danger-bg px-3.5 py-2.5 text-[13px] font-semibold text-danger">
          Reason: {pay.failure_reason.replace(/_/g, " ")}. Nothing was charged.
        </p>
      )}
      {st.label === "Under review" && <p className="mt-4 text-[13px] text-t3">A person is checking this payment. This page refreshes on its own.</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        {pay?.checkout_open && (
          <Link href={`/checkout/${encodeURIComponent(pay.session_id)}`} className={ACTION_PRIMARY}>
            Resume checkout <ArrowRight aria-hidden strokeWidth={2.4} />
          </Link>
        )}
        <Link href={askUrl(e.product.name)} className={ACTION_GHOST}>
          <MessageCircle aria-hidden /> Ask the assistant about this program
        </Link>
        <Link href={`/offers/${e.product.slug}`} className={ACTION_GHOST}>
          Program details
        </Link>
      </div>
    </li>
  );
}

/** Orders & receipts: one compact row per order, receipt expands for paid ones. */
function OrderRow({ e }: { e: BuyerEnrollment }) {
  const [open, setOpen] = useState(false);
  const paid = statusPill(e).label === "Paid";
  const receiptId = `receipt-ord-${e.order_id}`;
  return (
    <li className={cn(CARD, "p-4")}>
      <Header e={e} />
      <div className="mt-3 flex flex-wrap gap-2">
        {paid && (
          <button type="button" className={ACTION_GHOST} aria-expanded={open} aria-controls={receiptId} onClick={() => setOpen((v) => !v)}>
            <Receipt aria-hidden /> {open ? "Hide receipt" : "View receipt"}
          </button>
        )}
        {e.payment?.checkout_open && (
          <Link href={`/checkout/${encodeURIComponent(e.payment.session_id)}`} className={ACTION_PRIMARY}>
            Resume checkout <ArrowRight aria-hidden strokeWidth={2.4} />
          </Link>
        )}
      </div>
      {paid && open && <ReceiptBlock e={e} id={receiptId} />}
    </li>
  );
}

/** Inline receipt with the seller's legal identity and a Print button (print CSS isolates this block). */
function ReceiptBlock({ e, id }: { e: BuyerEnrollment; id: string }) {
  const [printing, setPrinting] = useState(false);
  const { biz } = useBusiness();
  const pay = e.payment;
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
    <section id={id} aria-label={`Receipt ${e.order_reference}`} className={cn("mt-4 rounded-2xl border border-hair bg-bg p-5", printing && "print-receipt")}>
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
  );
}

/** Profile: identity, conversations, the buy/sell switch and sign-out. */
function Profile({ data }: { data: Dashboard }) {
  const router = useRouter();
  const qc = useQueryClient();
  const signOut = async () => {
    await api.post("/auth/logout", undefined, { noAuthRedirect: true }).catch(() => {});
    qc.clear();
    router.replace("/");
  };
  return (
    <section id="profile" aria-labelledby="prof-h" className="mt-12 scroll-mt-24">
      <h2 id="prof-h" className={H2}>
        Profile
      </h2>
      <div className="mt-4 grid gap-3.5 md:grid-cols-2">
        <div className={CARD}>
          <dl className="grid gap-3 text-[13.5px]">
            <div>
              <dt className="text-[11.5px] font-bold tracking-[.06em] uppercase text-t4">Name</dt>
              <dd className="mt-0.5 font-extrabold">{data.user.full_name}</dd>
            </div>
            <div>
              <dt className="text-[11.5px] font-bold tracking-[.06em] uppercase text-t4">Email</dt>
              <dd className="mt-0.5 font-semibold [overflow-wrap:anywhere]">{data.user.email}</dd>
            </div>
            <div>
              <dt className="text-[11.5px] font-bold tracking-[.06em] uppercase text-t4">Sides</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                <Pill tone="brand">Buyer</Pill>
                {data.user.is_seller && <Pill tone="info">Seller</Pill>}
              </dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            {data.user.is_seller ? (
              <Link href="/dashboard" className={ACTION_GHOST}>
                <LayoutDashboard aria-hidden /> Switch to selling
              </Link>
            ) : (
              <Link href="/register?as=seller" className={ACTION_GHOST}>
                <Store aria-hidden /> Start selling
              </Link>
            )}
            <button type="button" className={ACTION_GHOST} onClick={() => void signOut()}>
              <LogOut aria-hidden /> Sign out
            </button>
          </div>
        </div>
        <div className={CARD}>
          <p className="eyebrow">Conversations</p>
          {data.conversations.length ? (
            <ul className="mt-2.5 grid gap-2.5">
              {data.conversations.map((c) => (
                <li key={c.id} className="rounded-[14px] bg-panel2 px-3.5 py-3 text-[13px]">
                  <p className="font-bold text-text">{formatDateTime(c.created_at)}</p>
                  <p className="mt-0.5 leading-[1.45] text-t3">{c.summary ?? "No summary yet."}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2.5 text-[13.5px] text-t3">No conversation yet.</p>
          )}
          <Link href="/assistant" className={cn(ACTION_GHOST, "mt-4")}>
            <MessageCircle aria-hidden /> Open the assistant
          </Link>
        </div>
      </div>
    </section>
  );
}
