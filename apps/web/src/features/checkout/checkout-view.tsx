"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CircleX, FlaskConical, Hand, Loader2, Lock, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Money, StatusBadge, humanize } from "@/components/ui-kit";
import { ApiError, newIdempotencyKey } from "@/lib/api";
import type { PayStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { publicApi } from "@/features/public/api";

const REVIEW_POLL_MS = 5000;

export function SimulatedBanner() {
  return (
    <div role="note" className="flex items-start gap-3 rounded-xl border border-info/30 bg-info/10 p-4 text-info-text">
      <FlaskConical aria-hidden className="mt-0.5 size-5 shrink-0" />
      <p>
        <span className="font-semibold">SIMULATED PAYMENT.</span> No real money moves and no card data is collected.
        Pick a fictional test method to see how the payment and security agents respond.
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

  const inReview = outcome?.status === "REQUIRES_APPROVAL";
  const q = useQuery({
    queryKey: ["public", "checkout", sessionId],
    queryFn: () => publicApi.checkout(sessionId),
    refetchInterval: (query) =>
      inReview || query.state.data?.status === "REQUIRES_APPROVAL" ? REVIEW_POLL_MS : false,
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
      router.replace(`/payment-failed?session=${sessionId}&reason=${encodeURIComponent(s.failure_reason ? `Payment failed: ${humanize(s.failure_reason.toUpperCase()).toLowerCase()}.` : "Payment failed.")}`);
  }, [s, inReview, fresh, router, sessionId]);

  const pay = async () => {
    if (!method || pending) return;
    keyRef.current ??= newIdempotencyKey();
    setPending(true);
    setError(null);
    try {
      const r = await publicApi.pay(sessionId, method, keyRef.current);
      keyRef.current = null;
      const tx = r.transaction_reference || s?.transaction_reference || "";
      if (r.status === "SUCCEEDED") {
        router.push(`/success?ref=${encodeURIComponent(tx)}&session=${sessionId}`);
        return;
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
    }
    setPending(false);
  };

  if (q.error) {
    if (q.error instanceof ApiError && q.error.status === 404)
      return (
        <EmptyState
          title="This checkout session was not found"
          description="It may have expired. Start again from the assistant or the program page."
          action={
            <Button asChild variant="outline">
              <Link href="/assistant">Back to the assistant</Link>
            </Button>
          }
        />
      );
    return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  }
  if (!s)
    return (
      <div className="grid gap-4" aria-busy>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );

  // A reviewer rejecting a held payment moves it to CANCELLED, so that wins over the local "in review" flag.
  const finalBlock = s.status === "CANCELLED" || s.status === "BLOCKED";
  const held = !finalBlock && (s.status === "REQUIRES_APPROVAL" || (inReview && !(fresh && (s.status === "FAILED" || s.status === "SUCCEEDED"))));
  const blocked = finalBlock || outcome?.status === "BLOCKED";

  return (
    <div className="grid gap-6">
      <SimulatedBanner />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <section aria-labelledby="pay-h" className="rounded-xl border bg-card p-5 md:p-6">
          {held ? (
            <ReviewState message={outcome?.message} reference={ref} />
          ) : blocked ? (
            <BlockedState message={outcome?.message} reference={ref} />
          ) : s.status === "SUCCEEDED" ? (
            <p role="status" className="flex items-center gap-2 text-muted-foreground">
              <Loader2 aria-hidden className="size-4 animate-spin" /> Payment confirmed, opening your receipt
            </p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void pay();
              }}
            >
              <h2 id="pay-h" className="text-xl font-semibold">
                Choose a test method
              </h2>
              {s.status === "FAILED" && (
                <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/8 p-3 text-sm text-danger-text">
                  <CircleX aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <span>
                    The last attempt failed{s.failure_reason ? `: ${humanize(s.failure_reason.toUpperCase()).toLowerCase()}.` : "."} You can try again with
                    another method.
                  </span>
                </p>
              )}
              <fieldset className="mt-4 grid gap-2" disabled={pending}>
                <legend className="sr-only">Fictional payment method</legend>
                {s.test_methods.map((m) => (
                  <label
                    key={m.id}
                    className={cn(
                      "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                      method === m.id ? "border-primary bg-primary/10" : "hover:bg-muted",
                    )}
                  >
                    <input
                      type="radio"
                      name="method"
                      value={m.id}
                      checked={method === m.id}
                      onChange={() => setMethod(m.id)}
                      className="size-4 accent-[var(--primary)]"
                    />
                    <span className="font-medium">{m.label}</span>
                  </label>
                ))}
              </fieldset>
              {error && (
                <p role="alert" className="mt-3 text-sm text-danger-text">
                  {error}
                </p>
              )}
              <Button type="submit" size="lg" className="mt-5 h-11 w-full px-4 sm:w-auto" disabled={!method || pending}>
                {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Lock aria-hidden />}
                {pending ? "Processing" : <>Pay <Money trim value={s.amount} currency={s.currency} /></>}
              </Button>
            </form>
          )}
        </section>

        <aside aria-label="Order summary" className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Order summary</h2>
          <p className="mt-3 font-medium">{s.product.name}</p>
          <p className="text-sm text-muted-foreground">
            <span className="num">{s.product.duration_weeks}</span> weeks · {s.product.level}
          </p>
          <dl className="mt-4 grid gap-2 border-t pt-4 text-sm">
            <Row label="Order">
              <span className="num">{s.order_reference}</span>
            </Row>
            {ref && (
              <Row label="Transaction">
                <span className="num">{ref}</span>
              </Row>
            )}
            <Row label="Status">
              <StatusBadge status={s.status} />
            </Row>
            <Row label="Total">
              <Money trim value={s.amount} currency={s.currency} className="text-base font-semibold" />
            </Row>
          </dl>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ReviewState({ message, reference }: { message?: string; reference: string }) {
  return (
    <div role="status" aria-live="polite">
      <span className="inline-flex size-11 items-center justify-center rounded-full bg-warning/15 text-warning-text">
        <Hand aria-hidden className="size-5" />
      </span>
      <h2 id="pay-h" className="mt-3 text-xl font-semibold">
        Under security review by our team
      </h2>
      <p className="mt-2 max-w-prose text-muted-foreground">
        {message ?? "The security agent held this payment for a human to check."} Nothing is charged while it waits. This
        page checks again every few seconds and moves on by itself once a reviewer decides.
      </p>
      {reference && (
        <p className="mt-3 text-sm">
          Reference <span className="num font-medium">{reference}</span>
        </p>
      )}
      <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 aria-hidden className="size-4 animate-spin" /> Waiting for a decision
      </p>
    </div>
  );
}

function BlockedState({ message, reference }: { message?: string; reference: string }) {
  return (
    <div role="alert">
      <span className="inline-flex size-11 items-center justify-center rounded-full bg-danger/12 text-danger-text">
        <ShieldAlert aria-hidden className="size-5" />
      </span>
      <h2 id="pay-h" className="mt-3 text-xl font-semibold">
        This payment cannot go through
      </h2>
      <p className="mt-2 max-w-prose text-muted-foreground">
        {message ?? "Our security controls stopped this payment, or a reviewer declined it."} Nothing was charged. If you
        think this is a mistake, tell the assistant and the team will follow up.
      </p>
      {reference && (
        <p className="mt-3 text-sm">
          Reference <span className="num font-medium">{reference}</span>
        </p>
      )}
      <Button asChild variant="outline" className="mt-5">
        <Link href="/assistant">Back to the assistant</Link>
      </Button>
    </div>
  );
}
