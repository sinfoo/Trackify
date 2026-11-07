import Link from "next/link";
import { ArrowRight, FlaskConical, Hand, MessageCircle, ShieldCheck, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgentRelay } from "@/features/public/agent-relay";
import { OfferList } from "@/features/public/offers";

const STEPS = [
  { title: "Talk to the assistant", body: "Type or speak. Ask what fits your background, what it costs, how hard it is." },
  { title: "Enroll", body: "When a program fits, the assistant opens an order for it. No account needed." },
  { title: "Simulated checkout", body: "Pick a fictional test method. Some succeed, some decline, on purpose." },
  { title: "Security checks", body: "The security agent scores the payment. Anything unusual is held for a person." },
];

const TRUST = [
  { icon: FlaskConical, title: "Payments are simulated", body: "Every checkout runs against a test simulator. No real money moves, ever." },
  { icon: WalletCards, title: "No card data", body: "There are no card number or CVV fields anywhere. You choose a labelled test method instead." },
  { icon: Hand, title: "Humans approve sensitive actions", body: "Agents cannot release a held payment or issue a refund. A team member decides, and the decision is logged." },
  { icon: ShieldCheck, title: "Instructions stay instructions", body: "Messages that try to rewrite the assistant's rules are flagged, logged and refused." },
];

export default function Page() {
  return (
    <>
      <section className="mx-auto w-full max-w-6xl px-4 pt-12 pb-10 md:px-6 md:pt-16">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <h1 className="max-w-3xl text-3xl leading-[1.1] font-semibold tracking-tight [overflow-wrap:anywhere] md:text-[3.25rem]">
              An academy for AI skills, run by six AI agents.
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
              Programs in generative AI, data and security. A sales agent answers you, five more handle the order, the
              payment, the numbers and the safety checks, and people sign off on anything risky.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="lg" className="h-11 px-5">
              <Link href="/assistant">
                <MessageCircle aria-hidden /> Talk to the assistant
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-11 px-5">
              <Link href="/offers">See programs</Link>
            </Button>
          </div>
        </div>
        <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-info/30 bg-info/10 px-3 py-1 text-sm text-info-text">
          <FlaskConical aria-hidden className="size-4" /> Fictional academy for a hackathon demo. Data is made up; payments are simulated.
        </p>
      </section>

      <section aria-labelledby="team-h" className="mx-auto w-full max-w-6xl px-4 pb-16 md:px-6">
        <h2 id="team-h" className="mb-5 text-xl font-semibold">
          Who does what
        </h2>
        <AgentRelay />
      </section>

      <section aria-labelledby="offers-h" className="border-y bg-card/60">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <h2 id="offers-h" className="text-xl font-semibold">
              Programs open for enrollment
            </h2>
            <Link href="/offers" className="inline-flex items-center gap-1 text-sm font-medium text-info-text underline-offset-4 hover:underline">
              All programs <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
          <OfferList limit={3} />
        </div>
      </section>

      <section aria-labelledby="how-h" className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6">
        <h2 id="how-h" className="text-xl font-semibold">
          From first question to a seat
        </h2>
        <ol className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0 lg:divide-x">
          {STEPS.map((s, i) => (
            <li key={s.title} className="lg:px-6 lg:first:pl-0 lg:last:pr-0">
              <span className="num text-3xl font-semibold text-primary-text">{i + 1}</span>
              <h3 className="mt-2 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="trust-h" className="border-t">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-16 md:px-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <div>
            <h2 id="trust-h" className="text-xl font-semibold">
              What is real here, and what is not
            </h2>
            <p className="mt-2 text-muted-foreground">The agents do real work on fictional data. Money never does.</p>
          </div>
          <dl className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
            {TRUST.map(({ icon: Icon, title, body }) => (
              <div key={title}>
                <dt className="flex items-center gap-2 font-semibold">
                  <Icon aria-hidden className="size-5 text-primary-text" /> {title}
                </dt>
                <dd className="mt-1 text-muted-foreground">{body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="bg-navy text-sidebar-foreground dark:bg-midnight">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-14 md:flex-row md:items-center md:justify-between md:px-6">
          <p className="max-w-xl text-xl font-semibold text-sidebar-accent-foreground">
            Not sure where to start? Tell the assistant what you do today and where you want to be.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="lg" className="h-11 px-5">
              <Link href="/assistant">
                <MessageCircle aria-hidden /> Talk to the assistant
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-11 border-sidebar-border bg-transparent px-5 text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
              <Link href="/offers">See programs</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
