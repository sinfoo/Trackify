"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CircleX, Loader2, MessageCircle, Receipt, RotateCcw, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, Money, SimulatedBadge } from "@/components/ui-kit";
import type { CheckoutSession } from "@/lib/types";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { loadSession, publicApi, type StoredSession } from "@/features/public/api";

export function SuccessView({ reference, session }: { reference?: string; session?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [receipt, setReceipt] = useState<CheckoutSession | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!session) return;
    publicApi.checkout(session).then(
      (r) => {
        // Never confirm an enrollment the server does not confirm (typed or stale URL): show the real checkout.
        if (r.status !== "SUCCEEDED") router.replace(`/checkout/${encodeURIComponent(session)}`);
        else {
          setReceipt(r);
          void qc.invalidateQueries({ queryKey: ["public"] }); // seats left + "Enrolled" on program pages
        }
      },
      () => setFailed(true), // fall back to the reference from the URL
    );
  }, [session, router, qc]);
  if (!session && !reference)
    return (
      <EmptyState
        className="mx-auto max-w-2xl"
        icon={Receipt}
        title="No receipt to show"
        description="This page shows your confirmation right after a payment. Enroll in a program to get one."
        action={
          <Button asChild>
            <Link href="/offers">See programs</Link>
          </Button>
        }
      />
    );
  if (session && !receipt && !failed)
    return (
      <p role="status" className="mx-auto flex max-w-2xl items-center gap-2 text-muted-foreground">
        <Loader2 aria-hidden className="size-4 animate-spin" /> Loading your receipt
      </p>
    );
  return (
    <div className="mx-auto grid max-w-2xl gap-8">
      <section className="rounded-xl border bg-card p-6 md:p-8">
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-success/12 text-success-text">
          <CircleCheck aria-hidden className="size-6" />
        </span>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">You are enrolled</h1>
          <SimulatedBadge />
        </div>
        <p className="mt-2 text-muted-foreground">
          The payment went through in the simulator and your seat is reserved. No real money moved.
        </p>
        {receipt ? (
          <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-lg border bg-muted/40 p-4 text-sm">
            <dt className="text-muted-foreground">Program</dt>
            <dd className="font-medium">
              {receipt.product.name}
              <span className="font-normal text-muted-foreground">
                {" "}· {receipt.product.duration_weeks} weeks · {receipt.product.level}
              </span>
            </dd>
            <dt className="text-muted-foreground">Amount</dt>
            <dd>
              <Money trim value={receipt.amount} currency={receipt.currency} className="font-semibold" />
            </dd>
            <dt className="text-muted-foreground">Order</dt>
            <dd className="num">{receipt.order_reference}</dd>
            <dt className="text-muted-foreground">Transaction</dt>
            <dd className="num">{reference ?? receipt.transaction_reference}</dd>
          </dl>
        ) : (
          reference && (
            <p className="mt-4">
              Transaction reference <span className="num font-semibold">{reference}</span>
            </p>
          )
        )}
        <h2 className="mt-6 font-semibold">What happens next</h2>
        <ol className="mt-2 grid list-decimal gap-1 pl-5 text-muted-foreground">
          <li>The analyst agent adds this enrollment to the academy&apos;s numbers.</li>
          <li>The team sends your welcome pack and schedule (fictional in this demo).</li>
          <li>Questions about the program? The assistant is still on.</li>
        </ol>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild size="lg" className="px-4">
            <Link href="/assistant">
              <MessageCircle aria-hidden /> Ask the assistant
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="px-4">
            <Link href="/offers">Browse other programs</Link>
          </Button>
        </div>
      </section>
      <FeedbackForm />
    </div>
  );
}

const FEEDBACK_KEY = "feedback.sent"; // conversation id that already rated: one rating per conversation

function FeedbackForm() {
  const [session, setSession] = useState<StoredSession | null | undefined>(undefined);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      const s = loadSession();
      setSession(s);
      if (s && localStorage.getItem(FEEDBACK_KEY) === s.conversation_id) setState("sent");
    });
  }, []);
  if (!session) return null; // no conversation to attach feedback to

  if (state === "sent")
    return (
      <p role="status" className="rounded-xl border bg-card p-5 text-center">
        Thanks for the feedback. It goes straight to the analyst agent&apos;s satisfaction score.
      </p>
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) return;
    setState("sending");
    setError(null);
    try {
      await publicApi.feedback(session, rating, comment.trim());
      localStorage.setItem(FEEDBACK_KEY, session.conversation_id);
      setState("sent");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send feedback. Try again.");
      setState("idle");
    }
  };

  return (
    <form onSubmit={submit} className="rounded-xl border bg-card p-6">
      <fieldset>
        <legend className="font-semibold">How was your experience?</legend>
        <div className="mt-3 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer rounded-md p-1 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
              <input
                type="radio"
                name="rating"
                value={n}
                checked={rating === n}
                onChange={() => setRating(n)}
                className="sr-only"
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
              />
              <Star
                aria-hidden
                className={cn("size-8 transition-colors duration-150", n <= rating ? "fill-primary text-primary" : "text-muted-foreground")}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <Label htmlFor="fb-comment" className="mt-4 block">
        Anything to add? (optional)
      </Label>
      <Textarea id="fb-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} className="mt-1.5" />
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger-text">
          {error}
        </p>
      )}
      <Button type="submit" className="mt-4" disabled={!rating || state === "sending"}>
        {state === "sending" && <Loader2 aria-hidden className="animate-spin" />}
        Send feedback
      </Button>
    </form>
  );
}

export function PaymentFailedView({ session, reason }: { session?: string; reason?: string }) {
  return (
    <section className="mx-auto max-w-2xl rounded-xl border bg-card p-6 md:p-8">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-danger/12 text-danger-text">
        <CircleX aria-hidden className="size-6" />
      </span>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">The payment did not go through</h1>
        <SimulatedBadge />
      </div>
      <p className="mt-2 text-muted-foreground">
        {reason || "The test method was declined."} Nothing was charged, and your order is still open.
      </p>
      <h2 className="mt-6 font-semibold">What you can do</h2>
      <ul className="mt-2 grid list-disc gap-1 pl-5 text-muted-foreground">
        <li>Try again with another test method on the same order.</li>
        <li>Ask the assistant about payment options or a different program.</li>
      </ul>
      <p className="mt-3 text-sm text-muted-foreground">
        Several failed attempts in a row get flagged by the security agent and held for a human to review.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        {session ? (
          <Button asChild size="lg" className="px-4">
            <Link href={`/checkout/${encodeURIComponent(session)}`}>
              <RotateCcw aria-hidden /> Try another method
            </Link>
          </Button>
        ) : (
          <Button asChild size="lg" className="px-4">
            <Link href="/offers">See programs</Link>
          </Button>
        )}
        <Button asChild size="lg" variant="outline" className="px-4">
          <Link href="/assistant">
            <MessageCircle aria-hidden /> Talk to the assistant
          </Link>
        </Button>
      </div>
    </section>
  );
}
