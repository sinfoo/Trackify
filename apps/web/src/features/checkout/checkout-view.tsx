"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Check, CircleX, Clock, CreditCard, FlaskConical, Hand, Info, Loader2, Lock, Scale, ServerCrash, Shield, ShieldAlert, Wallet, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, StatusBadge, humanize } from "@/components/ui-kit";
import { ApiError, newIdempotencyKey } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { PayStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { publicApi } from "@/features/public/api";
import { BuyingFrom } from "@/features/public/business-blocks";

const REVIEW_POLL_MS = 5000;
/** Minimum time the processing tracker stays on screen, so the three steps are readable. */
const TRACKER_MIN_MS = 1800;

/** Presentation for the API's five fictional methods (labels come from the API; icon, blurb and outcome pill are UI-only). */
const METHOD_UI: Record<string, { icon: LucideIcon; desc: string; outcome: string; tone: "success" | "danger" | "warning" }> = {
  sim_card_success: { icon: CreditCard, desc: "Approved by the simulator on the first try.", outcome: "Succeeds", tone: "success" },
  sim_wallet_success: { icon: Wallet, desc: "An e-wallet that settles instantly.", outcome: "Succeeds", tone: "success" },
  sim_card_declined: { icon: CircleX, desc: "The issuer declines. You can retry with another method.", outcome: "Declines", tone: "danger" },
  sim_insufficient_funds: { icon: CreditCard, desc: "Not enough balance on the test card.", outcome: "Declines", tone: "danger" },
  sim_provider_error: { icon: ServerCrash, desc: "The provider is unavailable; the payment agent reports an error.", outcome: "Error", tone: "warning" },
};
const TONE = {
  success: ["var(--success-bg)", "var(--success)"],
  danger: ["var(--danger-bg)", "var(--danger)"],
  warning: ["var(--warning-bg)", "var(--warning)"],
} as const;

const GHOST = "inline-flex items-center justify-center gap-2 rounded-[14px] border border-hair bg-panel2 px-[18px] text-sm font-extrabold text-text no-underline hover:bg-panel3 hover:no-underline";

export function SimulatedBanner() {
  return (
    <div role="note" className="flex items-center gap-3 rounded-[18px] border border-info bg-info-bg px-4 py-3.5 text-info">
      <FlaskConical aria-hidden className="size-[18px] shrink-0" strokeWidth={2.2} />
      <p className="text-sm leading-[1.45]">
        <span className="font-extrabold">Simulated payment.</span> No real money moves and no card data is collected. Pick a fictional test method to see how the payment
        and security agents respond.
      </p>
    </div>
  );
}

export function CheckoutView({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [method, setMethod] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ status: PayStatus; message: string; ref: string; at: number } | null>(null);
  // One key per pay attempt: reused if the same attempt is retried after a network error, dropped once answered.
  const keyRef = useRef<string | null>(null);
  // Guards a double click landing before React re-renders with `pending`.
  const busy = useRef(false);

  const inReview = outcome?.status === "REQUIRES_APPROVAL";
  const q = useQuery({
    queryKey: ["public", "checkout", sessionId],
    queryFn: () => publicApi.checkout(sessionId),
    refetchInterval: (query) => (inReview || query.state.data?.status === "REQUIRES_APPROVAL" ? REVIEW_POLL_MS : false),
  });
  const s = q.data;
  // Cached status from before the hold (e.g. FAILED after earlier declines) must not count as the review's result.
  const fresh = !!outcome && q.dataUpdatedAt > outcome.at;
  const ref = outcome?.ref || s?.transaction_reference || "";

  // Route on the server's view of the session (initial load and review polling).
  useEffect(() => {
    if (!s) return;
    const r = s.transaction_reference ?? "";
    if (s.status === "SUCCEEDED") router.replace(`/success?ref=${encodeURIComponent(r)}&session=${sessionId}`);
    else if (inReview && fresh && s.status === "FAILED")
      router.replace(
        `/payment-failed?session=${sessionId}&reason=${encodeURIComponent(s.failure_reason ? humanize(s.failure_reason.toUpperCase()).toLowerCase() : "declined by the simulator")}`,
      );
  }, [s, inReview, fresh, router, sessionId]);

  const pay = async () => {
    if (!method || busy.current) return;
    busy.current = true;
    keyRef.current ??= newIdempotencyKey();
    setPending(true);
    setError(null);
    const t0 = Date.now();
    const settle = () => new Promise((r) => setTimeout(r, Math.max(0, TRACKER_MIN_MS - (Date.now() - t0))));
    try {
      const r = await publicApi.pay(sessionId, method, keyRef.current);
      keyRef.current = null;
      const tx = r.transaction_reference || s?.transaction_reference || "";
      await settle();
      if (r.status === "SUCCEEDED") {
        router.push(`/success?ref=${encodeURIComponent(tx)}&session=${sessionId}`);
        return; // stay busy: the page is leaving
      }
      if (r.status === "FAILED") {
        router.push(`/payment-failed?session=${sessionId}&reason=${encodeURIComponent(r.message)}`);
        return;
      }
      setOutcome({ status: r.status, message: r.message, ref: tx, at: Date.now() });
      void q.refetch();
    } catch (e) {
      // Network failure or 5xx: keep the key so pressing Pay again replays the same attempt safely.
      if (e instanceof ApiError && e.status < 500) keyRef.current = null;
      setError(e instanceof ApiError ? e.message : "Connection problem. Press Pay again to retry the same attempt.");
      // Expired or already settled elsewhere: reload so the page shows the real state.
      if (e instanceof ApiError && e.status === 409) void q.refetch();
    }
    busy.current = false;
    setPending(false);
  };

  if (q.error) {
    // 422 = malformed id in the URL: same answer as an unknown one.
    if (q.error instanceof ApiError && (q.error.status === 404 || q.error.status === 422))
      return (
        <EmptyState
          title="This checkout link does not work"
          description="The link is incomplete or the checkout no longer exists. Pick the program again to open a new checkout."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/offers" className={cn(GHOST, "h-11 bg-brand text-on-brand hover:bg-brand")}>
                See programs
              </Link>
              <Link href="/assistant" className={cn(GHOST, "h-11")}>
                Ask the assistant
              </Link>
            </div>
          }
        />
      );
    return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  }
  if (!s)
    return (
      <div className="grid gap-4" aria-busy>
        <Skeleton className="h-16 w-full rounded-[18px]" />
        <Skeleton className="h-64 w-full rounded-[26px]" />
      </div>
    );

  // A reviewer rejecting a held payment moves it to CANCELLED, so that wins over the local "in review" flag.
  const finalBlock = s.status === "CANCELLED" || s.status === "BLOCKED";
  const held = !finalBlock && (s.status === "REQUIRES_APPROVAL" || (inReview && !(fresh && (s.status === "FAILED" || s.status === "SUCCEEDED"))));
  const blocked = finalBlock || outcome?.status === "BLOCKED";
  const expired =
    !held && !blocked && (s.status === "PENDING" || s.status === "FAILED") && !!s.expires_at && new Date(s.expires_at).getTime() < q.dataUpdatedAt; // as of the last fetch
  const amount = formatMoney(s.amount, s.currency, { trim: true });

  return (
    <div className="flex flex-col gap-[18px]">
      <SimulatedBanner />
      <div className="grid items-start gap-[22px] lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <section aria-labelledby="pay-h" className="min-h-[420px] rounded-[26px] border border-hair bg-panel p-[26px] shadow-card">
          {held ? (
            <ReviewState message={outcome?.message} reference={ref} />
          ) : blocked ? (
            <BlockedState message={outcome?.message} reference={ref} />
          ) : expired ? (
            <ExpiredState slug={s.product.slug} />
          ) : s.status === "SUCCEEDED" ? (
            <p role="status" className="flex items-center gap-2 text-t3">
              <Loader2 aria-hidden className="size-4 animate-spin" /> Payment confirmed, opening your receipt
            </p>
          ) : pending ? (
            <Processing />
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void pay();
              }}
            >
              <p className="eyebrow font-extrabold text-brand-text">Step 1 of 2</p>
              <h1 id="pay-h" className="headline mt-1 text-[26px]">
                Choose a test method
              </h1>
              <p className="mt-1.5 text-sm text-t3">Each method triggers a different path through the agents, on purpose.</p>
              {s.status === "FAILED" && (
                <p role="alert" className="anim-row-in mt-3.5 flex items-start gap-2 rounded-xl border border-danger bg-danger-bg px-3 py-2.5 text-[13px] font-semibold text-danger">
                  <CircleX aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <span>
                    The last attempt failed{s.failure_reason ? `: ${humanize(s.failure_reason.toUpperCase()).toLowerCase()}.` : "."} You can try again with another
                    method. Three failed attempts in a row are held for a human to review.
                  </span>
                </p>
              )}
              <fieldset className="mt-[18px] grid gap-2.5">
                <legend className="sr-only">Fictional payment method</legend>
                {s.test_methods.map((m) => {
                  const ui = METHOD_UI[m.id] ?? { icon: CreditCard, desc: "Fictional test method.", outcome: "Test", tone: "success" as const };
                  const [tile, fg] = TONE[ui.tone];
                  const on = method === m.id;
                  const Icon = ui.icon;
                  return (
                    <label
                      key={m.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-3.5 rounded-[18px] border px-4 py-3.5 text-left transition-all duration-200 hover:-translate-y-px has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/35",
                        on ? "border-brand bg-brand-bg shadow-[0_0_0_4px_var(--brand-bg)]" : "border-hair bg-panel2",
                      )}
                    >
                      <input type="radio" name="method" value={m.id} checked={on} onChange={() => setMethod(m.id)} className="sr-only" />
                      <span
                        aria-hidden
                        className={cn("grid size-[22px] shrink-0 place-items-center rounded-full border-2 transition-all duration-200", on ? "border-brand" : "border-hair2")}
                      >
                        {on && <span className="size-3 rounded-full bg-brand" />}
                      </span>
                      <span className="grid size-10 shrink-0 place-items-center rounded-[13px]" style={{ background: tile, color: fg }}>
                        <Icon aria-hidden className="size-[18px]" strokeWidth={2} />
                      </span>
                      <span className="min-w-0 flex-1 leading-[1.25]">
                        <span className="block text-[15px] font-extrabold text-text">{m.label}</span>
                        <span className="mt-0.5 block text-[12.5px] text-t3">{ui.desc}</span>
                      </span>
                      <span className="inline-flex h-6 items-center rounded-full px-[9px] text-[11.5px] font-extrabold whitespace-nowrap" style={{ background: tile, color: fg }}>
                        {ui.outcome}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
              {error && (
                <p role="alert" className="mt-3 flex items-center gap-2 rounded-xl border border-danger bg-danger-bg px-3 py-2.5 text-[13px] font-semibold text-danger">
                  <Info className="size-4 shrink-0" aria-hidden /> {error}
                </p>
              )}
              <button
                type="submit"
                disabled={!method}
                className={cn(
                  "mt-5 inline-flex h-[50px] items-center gap-2 rounded-[15px] px-[22px] text-[15px] font-extrabold transition-all duration-200",
                  method ? "bg-brand text-on-brand shadow-[0_10px_28px_rgba(245,166,35,.3)] hover:-translate-y-0.5" : "bg-panel3 text-t3",
                )}
              >
                <Lock aria-hidden className="size-4" strokeWidth={2.2} />
                Pay {amount}
              </button>
            </form>
          )}
        </section>

        <aside aria-label="Order summary" className="rounded-[26px] border border-hair bg-panel p-[22px] shadow-card">
          <p className="eyebrow">Order summary</p>
          <p className="mt-2.5 text-[17px] font-extrabold tracking-[-.015em]">{s.product.name}</p>
          <p className="text-[13px] text-t3">
            {s.product.duration_weeks} weeks · {s.product.level}
          </p>
          <dl className="mt-4 grid gap-2.5 border-t border-hair pt-3 text-[13.5px]">
            <Row label="Order">
              <span className="mono font-semibold">{s.order_reference}</span>
            </Row>
            {ref && (
              <Row label="Transaction">
                <span className="mono font-semibold">{ref}</span>
              </Row>
            )}
            <Row label="Status">
              <StatusBadge status={s.status} size="lg" />
            </Row>
            <div className="flex justify-between border-t border-hair pt-2.5">
              <dt className="font-extrabold">Total</dt>
              <dd className="tabular text-lg font-extrabold">{amount}</dd>
            </div>
          </dl>
          <div className="mt-4 grid gap-2">
            {(
              [
                [Shield, "No card number or CVV is ever asked for"],
                [Scale, "Prices live on the server; agents cannot change them"],
                [Hand, "Anything risky waits for a human decision"],
              ] as const
            ).map(([Icon, t]) => (
              <p key={t} className="flex items-center gap-2 text-[12.5px] text-t3">
                <Icon aria-hidden className="size-3.5 shrink-0 text-success" strokeWidth={2.4} />
                {t}
              </p>
            ))}
          </div>
          <BuyingFrom />
        </aside>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-t3">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const TRACKER = ["Session created", "Security check", "Decision"] as const;

/** Spinner + "Payment agent working" + the three-step pill tracker that advances while the API call runs. */
function Processing() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const a = setTimeout(() => setStep(1), 500);
    const b = setTimeout(() => setStep(2), 1200);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center py-10 text-center">
      <span aria-hidden className="size-[84px] animate-spin rounded-full border-4 border-panel3 border-t-brand" />
      <h1 id="pay-h" className="headline mt-[22px] text-2xl">
        Payment agent working
      </h1>
      <p className="mt-1.5 max-w-[420px] text-t3">The security agent scores the attempt first; the payment agent then runs it against the simulator.</p>
      <ol className="mt-[22px] flex flex-wrap justify-center gap-2.5">
        {TRACKER.map((label, i) => {
          const done = i < step;
          const on = i === step;
          return (
            <li
              key={label}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-bold transition-all duration-300",
                done ? "border-success bg-success-bg text-success" : on ? "border-brand bg-brand-bg text-text" : "border-hair bg-panel2 text-t3",
              )}
            >
              <span className={cn("grid size-[26px] place-items-center rounded-[9px]", done ? "bg-success text-on-brand" : on ? "bg-brand text-on-brand" : "bg-panel3 text-t3")}>
                {done ? <Check aria-hidden className="size-[13px]" strokeWidth={2.6} /> : on ? <Loader2 aria-hidden className="size-[13px] animate-spin" /> : <span className="size-1.5 rounded-full bg-current" />}
              </span>
              {label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Outcome({ icon: Icon, tone, title, children }: { icon: LucideIcon; tone: "warning" | "danger" | "neutral"; title: string; children: ReactNode }) {
  const cls = tone === "warning" ? "bg-warning-bg text-warning" : tone === "danger" ? "bg-danger-bg text-danger" : "bg-panel3 text-t3";
  return (
    <div className="[animation:popIn_.5s_cubic-bezier(.34,1.45,.64,1)_both]">
      <span className={cn("inline-grid size-14 place-items-center rounded-[18px]", cls)}>
        <Icon aria-hidden className="size-[26px]" strokeWidth={2} />
      </span>
      <h1 id="pay-h" className="headline mt-4 text-[26px]">
        {title}
      </h1>
      {children}
    </div>
  );
}

function ReviewState({ message, reference }: { message?: string; reference: string }) {
  return (
    <div role="status" aria-live="polite">
      <Outcome icon={Hand} tone="warning" title="A person will review this payment">
        <p className="mt-2 max-w-[520px] leading-[1.55] text-t2">
          {message ?? "The security agent held this payment for a human to check."} Nothing is charged while it waits. This page checks again every few seconds and moves
          on by itself once a reviewer decides.
        </p>
        {reference && (
          <p className="mt-3.5 text-[13.5px]">
            Reference <span className="mono font-bold">{reference}</span>
          </p>
        )}
        <p className="mt-3.5 flex items-center gap-2 text-[13.5px] text-t3">
          <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-panel3 border-t-brand" /> Waiting for a decision
        </p>
      </Outcome>
    </div>
  );
}

function ExpiredState({ slug }: { slug?: string }) {
  return (
    <div role="status">
      <Outcome icon={Clock} tone="neutral" title="This checkout has expired">
        <p className="mt-2 max-w-[520px] leading-[1.55] text-t2">Checkouts stay open for a limited time. Nothing was charged. Enroll again from the program page to get a fresh one.</p>
        <Link href={slug ? `/offers/${slug}` : "/offers"} className={cn(GHOST, "mt-5 h-[46px]")}>
          Back to the program
        </Link>
      </Outcome>
    </div>
  );
}

function BlockedState({ message, reference }: { message?: string; reference: string }) {
  return (
    <div role="alert">
      <Outcome icon={ShieldAlert} tone="danger" title="This payment cannot go through">
        <p className="mt-2 max-w-[520px] leading-[1.55] text-t2">
          {message ?? "Our security controls stopped this payment, or a reviewer declined it."} Nothing was charged. If you think this is a mistake, tell the assistant and
          the team will follow up.
        </p>
        {reference && (
          <p className="mt-3.5 text-[13.5px]">
            Reference <span className="mono font-bold">{reference}</span>
          </p>
        )}
        <Link href="/assistant" className={cn(GHOST, "mt-5 h-[46px]")}>
          Back to the assistant
        </Link>
      </Outcome>
    </div>
  );
}

