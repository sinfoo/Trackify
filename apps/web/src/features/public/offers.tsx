"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Loader2, MessageCircle, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Money } from "@/components/ui-kit";
import { ApiError } from "@/lib/api";
import type { Offer } from "@/lib/types";
import { cn } from "@/lib/utils";
import { enrollInProduct, loadSession, publicApi } from "./api";

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

export function EnrollButton({ offer, className, size = "lg" }: { offer: Pick<Offer, "id" | "name" | "seats_left">; className?: string; size?: "lg" | "default" }) {
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
      <Button size={size} variant="outline" className={cn("px-4", className)} disabled>
        <CheckCircle2 aria-hidden className="text-success" /> Enrolled
        <span className="sr-only"> in {offer.name}</span>
      </Button>
    );
  if (openCheckout)
    return (
      <Button asChild size={size} className={cn("px-4", className)}>
        <Link href={`/checkout/${openCheckout.session_id}`}>
          <ArrowRight aria-hidden /> Resume checkout
          <span className="sr-only"> for {offer.name}</span>
        </Link>
      </Button>
    );
  return (
    <Button size={size} className={cn("px-4", className)} onClick={go} disabled={pending || soldOut}>
      {pending ? <Loader2 aria-hidden className="animate-spin" /> : <ArrowRight aria-hidden />}
      {soldOut ? "Sold out" : "Enroll"}
      <span className="sr-only"> in {offer.name}</span>
    </Button>
  );
}

export function SeatsLeft({ offer, className }: { offer: Pick<Offer, "seats_left" | "seats_total">; className?: string }) {
  const low = offer.seats_left > 0 && offer.seats_left <= 5;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", low ? "text-warning-text" : "text-muted-foreground", className)}>
      <Users aria-hidden className="size-4" />
      <span className="num">{offer.seats_left}</span> of <span className="num">{offer.seats_total}</span> seats left
    </span>
  );
}

/** Row-style list: one program per row, price and facts aligned in columns so offers compare at a glance. */
export function OfferList({ limit }: { limit?: number }) {
  const { data, isLoading, error, refetch } = useOffers();
  if (error) return <ErrorState error={error} title="Could not load the programs" onRetry={() => void refetch()} />;
  if (isLoading)
    return (
      <div className="grid gap-3" aria-busy>
        {Array.from({ length: limit ?? 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    );
  const offers = (data ?? []).filter((o) => o.status === "ACTIVE" || !o.status).slice(0, limit);
  if (!offers.length) return <EmptyState title="No programs open right now" description="Check back soon." />;
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {offers.map((o) => (
        <li key={o.id} className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-lg font-semibold">
                <Link href={`/offers/${o.slug}`} className="underline-offset-4 hover:underline">
                  {o.name}
                </Link>
              </h3>
              <span className="text-sm text-muted-foreground">{o.category}</span>
            </div>
            <p className="mt-1 text-muted-foreground">{o.summary}</p>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span>
                <span className="num">{o.duration_weeks}</span> weeks
              </span>
              <span>{o.level}</span>
              <SeatsLeft offer={o} />
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 md:items-end">
            <Money trim value={o.price} currency={o.currency} className="text-xl font-semibold" />
            <div className="flex gap-2">
              <Button asChild variant="outline" size="lg" className="px-4">
                <Link href={`/offers/${o.slug}`}>
                  Details<span className="sr-only"> about {o.name}</span>
                </Link>
              </Button>
              <EnrollButton offer={o} />
            </div>
          </div>
        </li>
      ))}
    </ul>
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
            <Button asChild variant="outline">
              <Link href="/offers">See all programs</Link>
            </Button>
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
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <article className="min-w-0">
        <p className="text-sm text-muted-foreground">
          <Link href="/offers" className="underline-offset-4 hover:underline">
            Programs
          </Link>{" "}
          / {o.category}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">{o.name}</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted-foreground">{o.summary}</p>
        {/* Small screens: price and Enroll up front; the full card sits below the content. */}
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 lg:hidden">
          <Money trim value={o.price} currency={o.currency} className="text-2xl font-semibold" />
          <EnrollButton offer={o} />
        </div>
        <p className="mt-6 max-w-2xl">{o.description}</p>

        <h2 className="mt-10 text-xl font-semibold">What you will be able to do</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {o.learning_outcomes.map((x) => (
            <li key={x} className="flex gap-2.5">
              <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
              <span>{x}</span>
            </li>
          ))}
        </ul>

        <h2 className="mt-10 text-xl font-semibold">Who it is for</h2>
        <p className="mt-3 max-w-2xl">{o.target_audience}</p>
      </article>

      <aside aria-label="Enrollment" className="rounded-xl border bg-card p-5 lg:sticky lg:top-6">
        <Money trim value={o.price} currency={o.currency} className="block text-3xl font-semibold" />
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Duration</dt>
            <dd className="font-medium">
              <span className="num">{o.duration_weeks}</span> weeks
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Level</dt>
            <dd className="font-medium">{o.level}</dd>
          </div>
        </dl>
        <SeatsLeft offer={o} className="mt-4" />
        <div className="mt-5 grid gap-2">
          <EnrollButton offer={o} className="w-full" />
          <Button asChild variant="outline" size="lg" className="w-full px-4">
            <Link href={ask}>
              <MessageCircle aria-hidden /> Ask the assistant
            </Link>
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Checkout is simulated. No card details, no real money.</p>
      </aside>
    </div>
  );
}
