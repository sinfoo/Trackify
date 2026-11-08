"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, CircleCheck, Clock, Gauge, Loader2, MessageCircle, Users } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui-kit";
import { ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { Offer } from "@/lib/types";
import { cn } from "@/lib/utils";
import { enrollInProduct, loadSession, publicApi } from "./api";
import { OfferedBy } from "./business-blocks";

export const offersKey = ["public", "offers"] as const;

export function useOffers() {
  return useQuery({ queryKey: offersKey, queryFn: publicApi.offers, staleTime: 60_000 });
}

const journeyKey = ["public", "journey"] as const;

/** What this browser's conversation already owns: enrolled programs and open checkouts. Null without a session. */
function useJourney() {
  return useQuery({
    queryKey: journeyKey,
    queryFn: async () => {
      const s = loadSession();
      return s ? ((await publicApi.conversation(s)).journey ?? null) : null;
    },
    retry: false,
  });
}

/** Prototype primary: amber, 50px, radius 15, 15/800, glow. */
export const PRIMARY_BTN =
  "inline-flex h-[50px] items-center justify-center gap-2 rounded-[15px] bg-brand px-[22px] text-[15px] font-extrabold text-on-brand no-underline shadow-[0_10px_28px_rgba(245,166,35,.3)] transition-transform duration-200 hover:-translate-y-0.5 hover:no-underline disabled:pointer-events-none disabled:opacity-60 [&_svg]:size-4";
/** Prototype secondary: hairline + panel2, 46px, radius 15, 14/800. */
export const GHOST_BTN =
  "inline-flex h-[46px] items-center justify-center gap-2 rounded-[15px] border border-hair bg-panel2 px-[18px] text-sm font-extrabold text-text no-underline hover:bg-panel3 hover:no-underline [&_svg]:size-4";

/** Enroll / Enrolled / Resume checkout / Sold out, from the journey of this browser's conversation. */
export function EnrollButton({ offer, className }: { offer: Pick<Offer, "id" | "name" | "seats_left">; className?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: journey } = useJourney();
  const [pending, setPending] = useState(false);
  const soldOut = offer.seats_left <= 0;
  const enrolled = journey?.enrolled_product_ids.includes(offer.id);
  const openCheckout = journey?.open_checkouts.find((c) => c.product_id === offer.id);
  const go = async () => {
    setPending(true);
    try {
      router.push(`/checkout/${await enrollInProduct(offer.id)}`);
      // Back from checkout keeps this component alive: refreshed journey turns it into "Resume checkout".
      void qc.invalidateQueries({ queryKey: journeyKey });
    } catch (e) {
      if (e instanceof ApiError && e.code === "ALREADY_ENROLLED") {
        toast.success(e.message);
        void qc.invalidateQueries({ queryKey: journeyKey });
      } else toast.error(e instanceof ApiError ? e.message : "Could not start enrollment. Try again.");
      setPending(false);
    }
  };
  if (enrolled)
    return (
      <button type="button" className={cn(PRIMARY_BTN, "bg-success-bg text-success shadow-none hover:translate-y-0", className)} disabled>
        <Check aria-hidden strokeWidth={2.6} /> Enrolled
        <span className="sr-only"> in {offer.name}</span>
      </button>
    );
  if (openCheckout)
    return (
      <Link href={`/checkout/${openCheckout.session_id}`} className={cn(PRIMARY_BTN, className)}>
        Resume checkout <ArrowRight aria-hidden strokeWidth={2.4} />
        <span className="sr-only"> for {offer.name}</span>
      </Link>
    );
  return (
    <button type="button" className={cn(PRIMARY_BTN, className)} onClick={go} disabled={pending || soldOut}>
      {soldOut ? "Sold out" : "Enroll"}
      {pending ? <Loader2 aria-hidden className="animate-spin" /> : !soldOut && <ArrowRight aria-hidden strokeWidth={2.4} />}
      <span className="sr-only"> in {offer.name}</span>
    </button>
  );
}

/** Seat colours: 5 or fewer left = warning, otherwise success. */
export const seatTone = (left: number) => (left <= 5 ? "bg-warning-bg text-warning" : "bg-success-bg text-success");
const seatText = (left: number) => (left <= 5 ? "text-warning" : "text-success");

function OfferCardItem({ o, compact }: { o: Offer; compact?: boolean }) {
  return (
    <li className="min-w-0">
      <Link
        href={`/offers/${o.slug}`}
        className="flex h-full flex-col gap-3.5 rounded-3xl border border-hair bg-panel p-5 text-text no-underline shadow-card transition-[transform,box-shadow] duration-[250ms] [transition-timing-function:cubic-bezier(.2,.8,.2,1)] hover:-translate-y-1 hover:no-underline hover:shadow-lift"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11.5px] font-extrabold tracking-[.06em] uppercase text-t4">{o.category}</span>
          <span className={cn("inline-flex h-6 items-center gap-[5px] rounded-full px-[9px] text-[11.5px] font-extrabold whitespace-nowrap", seatTone(o.seats_left))}>
            <Users aria-hidden className="size-3" strokeWidth={2.4} />
            {compact ? `${o.seats_left} seats left` : `${o.seats_left} of ${o.seats_total} seats`}
          </span>
        </div>
        <h3 className="text-[19px] leading-[1.2] font-extrabold tracking-[-.02em]">{o.name}</h3>
        <p className="flex-1 text-[13.5px] leading-[1.5] text-t3">{o.summary}</p>
        <div className="flex items-end justify-between gap-3">
          <span>
            <span className="tabular block text-2xl font-extrabold tracking-[-.03em]">
              {formatMoney(o.price, "", { trim: true })} <span className="text-[13px] font-semibold text-t3">{o.currency}</span>
            </span>
            <span className="mt-0.5 block text-[12.5px] text-t3">
              {o.duration_weeks} weeks · {o.level}
            </span>
          </span>
          {compact ? (
            <span className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-brand">
              <ArrowRight aria-hidden className="size-[17px] text-on-brand" strokeWidth={2.4} />
            </span>
          ) : (
            <span className="inline-flex h-[38px] shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3.5 text-[13px] font-extrabold text-on-brand">
              Details <ArrowRight aria-hidden className="size-3.5" strokeWidth={2.4} />
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}

/** Card grid. `limit` = landing teaser (seat pill "n seats left", round arrow). `category` filters. */
export function OfferGrid({ limit, category }: { limit?: number; category?: string | null }) {
  const { data, isLoading, error, refetch } = useOffers();
  if (error) return <ErrorState error={error} title="Could not load the programs" onRetry={() => void refetch()} />;
  if (isLoading)
    return (
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-3.5" aria-busy>
        {Array.from({ length: limit ?? 6 }, (_, i) => (
          <li key={i}>
            <Skeleton className="h-[236px] w-full rounded-3xl" />
          </li>
        ))}
      </ul>
    );
  const offers = (data ?? [])
    .filter((o) => (o.status === "ACTIVE" || !o.status) && (!category || o.category === category))
    .slice(0, limit);
  if (!offers.length) return <EmptyState title="No programs open right now" description="Check back soon." />;
  return (
    <ul className={cn("grid gap-3.5", limit ? "grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))]" : "grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))]")}>
      {offers.map((o) => (
        <OfferCardItem key={o.id} o={o} compact={!!limit} />
      ))}
    </ul>
  );
}

/** /offers body: category chips (36px, 999) + the full grid. */
export function ProgramsBrowser() {
  const { data } = useOffers();
  const [cat, setCat] = useState<string | null>(null);
  const cats = Array.from(new Set((data ?? []).map((o) => o.category)));
  return (
    <>
      <div className="mt-[22px] flex flex-wrap gap-2" role="group" aria-label="Category">
        {[null, ...cats].map((c) => {
          const on = cat === c;
          return (
            <button
              key={c ?? "all"}
              type="button"
              aria-pressed={on}
              onClick={() => setCat(c)}
              className={cn(
                "h-9 rounded-full border px-3.5 text-[13px] font-bold transition-all duration-200",
                on ? "border-text bg-text text-bg" : "border-hair bg-panel text-t2 hover:bg-panel2",
              )}
            >
              {c ?? "All programs"}
            </button>
          );
        })}
      </div>
      <div className="mt-[22px]">
        <OfferGrid category={cat} />
      </div>
    </>
  );
}

export function OfferDetail({ slug }: { slug: string }) {
  const { data: o, isLoading, error, refetch } = useQuery({
    queryKey: [...offersKey, slug],
    queryFn: () => publicApi.offer(slug),
  });
  if (error) {
    if (error instanceof ApiError && error.status === 404)
      return (
        <EmptyState
          title="This program does not exist"
          description="It may have been renamed or archived."
          action={
            <Link href="/offers" className={GHOST_BTN}>
              See all programs
            </Link>
          }
        />
      );
    return <ErrorState error={error} onRetry={() => void refetch()} />;
  }
  if (isLoading || !o)
    return (
      <div className="grid gap-4" aria-busy>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );

  const ask = `/assistant?q=${encodeURIComponent(`Is ${o.name} right for me?`)}`;
  const facts = [
    [Clock, `${o.duration_weeks} weeks`],
    [Gauge, o.level],
    [Users, `${o.seats_left} of ${o.seats_total} seats`],
  ] as const;
  return (
    <>
      <Link href="/offers" className="inline-flex items-center gap-1.5 text-[13px] font-bold text-t3 no-underline hover:text-text hover:no-underline">
        <ArrowLeft aria-hidden className="size-3.5" /> All programs
      </Link>
      <div className="mt-[18px] grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <article className="min-w-0">
          <p className="eyebrow font-extrabold text-brand-text">{o.category}</p>
          <h1 className="mt-1.5 text-[clamp(32px,4vw,46px)] leading-[1.05] font-extrabold tracking-[-.035em] [overflow-wrap:anywhere]">{o.name}</h1>
          <p className="mt-3.5 max-w-[640px] text-lg leading-[1.5] text-t2">{o.summary}</p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            {facts.map(([Icon, t]) => (
              <span key={t} className="inline-flex h-10 items-center gap-2 rounded-xl border border-hair bg-panel px-3.5 text-[13.5px] font-bold">
                <Icon aria-hidden className="size-[15px] text-brand-text" strokeWidth={2.2} />
                {t}
              </span>
            ))}
          </div>
          {o.description && <p className="mt-6 max-w-[640px] text-[15.5px] leading-[1.55] text-t2">{o.description}</p>}

          <h2 className="mt-10 text-[22px] font-extrabold tracking-[-.02em]">What you will be able to do</h2>
          <ul className="mt-3.5 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-2.5">
            {o.learning_outcomes.map((x) => (
              <li key={x} className="flex gap-2.5 rounded-2xl border border-hair bg-panel px-4 py-3.5 text-sm leading-[1.4] font-semibold">
                <CircleCheck aria-hidden className="size-[18px] shrink-0 text-success" strokeWidth={2.2} />
                {x}
              </li>
            ))}
          </ul>

          <h2 className="mt-10 text-[22px] font-extrabold tracking-[-.02em]">Who it is for</h2>
          <p className="mt-2.5 max-w-[640px] text-[15.5px] leading-[1.55] text-t2">{o.target_audience}</p>
        </article>

        <div className="grid gap-3.5 lg:sticky lg:top-[92px]">
          <aside aria-label="Enrollment" className="rounded-[26px] border border-hair bg-panel p-[22px] shadow-lift">
            <span className="tabular block text-4xl font-extrabold tracking-[-.035em]">
              {formatMoney(o.price, "", { trim: true })} <span className="text-[15px] font-semibold text-t3">{o.currency}</span>
            </span>
            <dl className="mt-3.5 grid grid-cols-2 gap-2.5">
              <div className="rounded-[14px] bg-panel2 px-3 py-2.5">
                <dt className="text-[11.5px] font-bold tracking-[.06em] uppercase text-t4">Duration</dt>
                <dd className="mt-0.5 text-[15px] font-extrabold">{o.duration_weeks} weeks</dd>
              </div>
              <div className="rounded-[14px] bg-panel2 px-3 py-2.5">
                <dt className="text-[11.5px] font-bold tracking-[.06em] uppercase text-t4">Level</dt>
                <dd className="mt-0.5 text-[15px] font-extrabold">{o.level}</dd>
              </div>
            </dl>
            <p className={cn("mt-3.5 flex items-center gap-2 text-[13.5px] font-bold", seatText(o.seats_left))}>
              <Users aria-hidden className="size-[15px]" strokeWidth={2.2} />
              {o.seats_left} of {o.seats_total} seats left
            </p>
            <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-panel3" role="meter" aria-valuemin={0} aria-valuemax={o.seats_total} aria-valuenow={o.seats_total - o.seats_left} aria-label="Seats taken">
              <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.round(((o.seats_total - o.seats_left) / Math.max(1, o.seats_total)) * 100)}%` }} />
            </span>
            <EnrollButton offer={o} className="mt-4 w-full" />
            <Link href={ask} className={cn(GHOST_BTN, "mt-2 w-full")}>
              <MessageCircle aria-hidden /> Ask the assistant
            </Link>
            <p className="mt-3 text-center text-xs text-t4">Checkout is simulated. No card details, no real money.</p>
          </aside>
          <OfferedBy />
        </div>
      </div>
    </>
  );
}
