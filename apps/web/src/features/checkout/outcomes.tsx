"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Check, LayoutList, Loader2, MessageCircle, Receipt, RotateCcw, Star, X } from "lucide-react";
import { EmptyState } from "@/components/ui-kit";
import { ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { CheckoutSession } from "@/lib/types";
import { cn } from "@/lib/utils";
import { loadSession, publicApi, type StoredSession } from "@/features/public/api";
import "@/features/public/public.css";

const PRIMARY = "inline-flex h-12 items-center gap-2 rounded-[14px] bg-brand px-5 text-[14.5px] font-extrabold text-on-brand no-underline hover:no-underline [&_svg]:size-[15px]";
const GHOST = "inline-flex h-12 items-center gap-2 rounded-[14px] border border-hair bg-panel px-5 text-[14.5px] font-extrabold text-text no-underline hover:bg-panel2 hover:no-underline [&_svg]:size-[15px]";

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
        className="mx-auto max-w-[640px]"
        icon={Receipt}
        title="No receipt to show"
        description="This page shows your confirmation right after a payment. Enroll in a program to get one."
        action={
          <Link href="/offers" className={PRIMARY}>
            See programs
          </Link>
        }
      />
    );
  if (session && !receipt && !failed)
    return (
      <p role="status" className="mx-auto flex max-w-[640px] items-center justify-center gap-2 text-t3">
        <Loader2 aria-hidden className="size-4 animate-spin" /> Loading your receipt
      </p>
    );
  const rows: [string, string, boolean][] = receipt
    ? [
        ["Program", `${receipt.product.name} · ${receipt.product.duration_weeks} weeks · ${receipt.product.level}`, false],
        ["Amount", `${formatMoney(receipt.amount, receipt.currency, { trim: true })} · simulated`, false],
        ["Order", receipt.order_reference, true],
        ["Transaction", reference ?? receipt.transaction_reference ?? "", true],
      ]
    : [["Transaction", reference ?? "", true]];
  return (
    <div className="anim-rise mx-auto max-w-[640px] text-center">
      <span className="relative inline-grid size-24 place-items-center rounded-full bg-success-bg [animation:popIn_.6s_cubic-bezier(.34,1.45,.64,1)_both]">
        <span aria-hidden className="orb-ring absolute -inset-2.5 rounded-full border-2 border-success opacity-40" />
        <Check aria-hidden className="size-11 text-success" strokeWidth={2.6} />
      </span>
      <h1 className="mt-6 text-4xl font-extrabold tracking-[-.035em]">You are enrolled.</h1>
      <p className="mt-2.5 text-base leading-[1.5] text-t2">
        The simulated payment{receipt ? <> for <span className="font-extrabold text-text">{receipt.product.name}</span></> : null} went through. A confirmation would
        normally land in your inbox; here, nothing is sent.
      </p>
      <div className="mx-auto mt-[26px] max-w-[460px] rounded-3xl border border-hair bg-panel p-5 text-left shadow-card">
        <dl className="grid gap-2.5 text-[13.5px]">
          {rows.map(([l, v, mono]) => (
            <div key={l} className="flex justify-between gap-4">
              <dt className="shrink-0 text-t3">{l}</dt>
              <dd className={cn("text-right font-bold", mono ? "mono" : "tabular")}>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="mt-[22px] flex flex-wrap justify-center gap-2.5">
        <Link href="/account" className={PRIMARY}>
          <LayoutList aria-hidden /> See my enrollments
        </Link>
        <Link href="/offers" className={GHOST}>
          Browse more programs
        </Link>
        <Link href="/assistant" className={GHOST}>
          <MessageCircle aria-hidden /> Ask the assistant
        </Link>
      </div>
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
      <p role="status" className="mx-auto mt-6 max-w-[460px] rounded-3xl border border-hair bg-panel p-5 text-[13.5px] text-t2">
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
    <form onSubmit={submit} className="mx-auto mt-6 max-w-[460px] rounded-3xl border border-hair bg-panel p-5 text-left shadow-card">
      <fieldset>
        <legend className="text-[15px] font-extrabold">Rate the assistant</legend>
        <p className="mt-0.5 text-[12.5px] text-t3">One rating per conversation. It feeds the analyst agent&apos;s satisfaction score.</p>
        <div className="mt-3 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer rounded-lg p-1 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/35">
              <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} className="sr-only" aria-label={`${n} star${n > 1 ? "s" : ""}`} />
              <Star aria-hidden className={cn("size-8 transition-colors duration-150", n <= rating ? "fill-brand text-brand" : "text-t4")} />
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor="fb-comment" className="mt-4 block text-[13px] font-bold text-t2">
        Anything to add? (optional)
      </label>
      <textarea
        id="fb-comment"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={1000}
        className="mt-1.5 min-h-[72px] w-full rounded-xl border border-hair bg-input px-3 py-2.5 text-sm text-text outline-none placeholder:text-t4 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/35"
      />
      {error && (
        <p role="alert" className="mt-2 text-[13px] font-semibold text-danger">
          {error}
        </p>
      )}
      <button type="submit" className={cn(PRIMARY, "mt-4 h-11 disabled:pointer-events-none disabled:opacity-50")} disabled={!rating || state === "sending"}>
        {state === "sending" && <Loader2 aria-hidden className="animate-spin" />}
        Send feedback
      </button>
    </form>
  );
}

export function PaymentFailedView({ session, reason }: { session?: string; reason?: string }) {
  return (
    <div className="anim-rise mx-auto max-w-[640px] text-center">
      <span className="inline-grid size-24 place-items-center rounded-full bg-danger-bg [animation:popIn_.6s_cubic-bezier(.34,1.45,.64,1)_both]">
        <X aria-hidden className="size-11 text-danger" strokeWidth={2.6} />
      </span>
      <h1 className="mt-6 text-4xl font-extrabold tracking-[-.035em]">The payment did not go through.</h1>
      <p className="mt-2.5 text-base leading-[1.5] text-t2">
        The simulator declined the test method: <span className="font-extrabold text-text">{(reason || "declined by the simulator").replace(/\.$/, "")}</span>. Nothing was
        charged and your seat is still held while the checkout stays open.
      </p>
      <p className="mt-3 text-[13px] text-t3">Several failed attempts in a row get flagged by the security agent and held for a human to review.</p>
      <div className="mt-[26px] flex flex-wrap justify-center gap-2.5">
        {session ? (
          <Link href={`/checkout/${encodeURIComponent(session)}`} className={PRIMARY}>
            <RotateCcw aria-hidden strokeWidth={2.4} /> Try another method
          </Link>
        ) : (
          <Link href="/offers" className={PRIMARY}>
            See programs
          </Link>
        )}
        <Link href="/assistant" className={GHOST}>
          <MessageCircle aria-hidden /> Ask the assistant
        </Link>
        <Link href="/account" className={GHOST}>
          <LayoutList aria-hidden /> My enrollments
        </Link>
      </div>
    </div>
  );
}
