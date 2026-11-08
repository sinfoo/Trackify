import Link from "next/link";
import { ArrowRight, CreditCard, FlaskConical, Hand, Mic, Shield, ShieldCheck, WalletCards, Workflow } from "lucide-react";
import { HeroStats } from "@/features/public/hero-stats";
import { LiveRelay } from "@/features/public/live-relay";
import { OfferGrid } from "@/features/public/offers";
import { WhoYouAreBuyingFrom } from "@/features/public/business-blocks";

const STEPS = [
  { icon: Mic, agent: "sales", title: "Talk to the assistant", body: "Type or speak. Ask what fits your background, what it costs, how hard it is." },
  { icon: Workflow, agent: "orchestrator", title: "Enroll", body: "When a program fits, the assistant opens an order for it. No account needed." },
  { icon: CreditCard, agent: "payment", title: "Simulated checkout", body: "Pick a fictional test method. Some succeed, some decline, on purpose." },
  { icon: Shield, agent: "security", title: "Security checks", body: "The security agent scores the payment. Anything unusual is held for a person." },
];

const TRUST = [
  { icon: FlaskConical, title: "Payments are simulated", body: "Every checkout runs against a test simulator. No real money moves, ever." },
  { icon: WalletCards, title: "No card data", body: "There are no card number or CVV fields anywhere. You choose a labelled test method instead." },
  { icon: Hand, title: "Humans approve sensitive actions", body: "Agents cannot release a held payment or issue a refund. A team member decides, and the decision is logged." },
  { icon: ShieldCheck, title: "Instructions stay instructions", body: "Messages that try to rewrite the assistant's rules are flagged, logged and refused." },
];

const CTA = "inline-flex h-[50px] items-center gap-2 rounded-[15px] px-[22px] text-[15px] font-extrabold no-underline hover:no-underline";

export default function Page() {
  return (
    <>
      {/* Hero: always dark, amber + blue glows, masked dot grid. */}
      <section className="relative overflow-hidden bg-[linear-gradient(160deg,#0E1C3E_0%,#0A1530_50%,#0B1A3A_100%)] text-[#F3F5F9]">
        <div aria-hidden className="pointer-events-none absolute -top-[300px] -left-[200px] size-[760px] rounded-full bg-[radial-gradient(circle,rgba(245,166,35,.26),rgba(245,166,35,.05)_50%,rgba(245,166,35,0)_70%)]" />
        <div aria-hidden className="pointer-events-none absolute -right-[200px] -bottom-[320px] size-[700px] rounded-full bg-[radial-gradient(circle,rgba(57,123,255,.2),rgba(57,123,255,0)_65%)]" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_at_70%_40%,#000_30%,transparent_75%)]"
        />
        <div className="relative mx-auto grid max-w-[1180px] grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] items-center gap-12 px-6 pt-[72px] pb-16">
          <div className="[animation:rise_.6s_cubic-bezier(.2,.8,.2,1)_both]">
            <span className="inline-flex h-[30px] items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 text-[12.5px] font-bold text-[rgba(243,245,249,.85)]">
              <FlaskConical aria-hidden className="size-[13px] text-[#FFC65C]" />
              Fictional business · hackathon demo · payments simulated
            </span>
            <h1 className="mt-[22px] max-w-[640px] text-[clamp(38px,4.6vw,60px)] leading-[1.02] font-extrabold tracking-[-.035em]">
              AI skills programs, sold and run by six AI agents.
            </h1>
            <p className="mt-5 max-w-[560px] text-lg leading-[1.5] text-[rgba(243,245,249,.72)]">
              A sales agent answers you by text or voice. Five more handle the order, the simulated payment, the numbers and the safety checks. People sign off on
              anything risky.
            </p>
            <div className="mt-7 flex flex-wrap gap-2.5">
              <Link href="/assistant" className={`${CTA} bg-[#F5A623] text-[#0B1730] shadow-[0_10px_28px_rgba(245,166,35,.35)] transition-transform duration-200 hover:-translate-y-0.5`}>
                <Mic aria-hidden className="size-[17px]" strokeWidth={2.2} /> Talk to the assistant
              </Link>
              <Link href="/offers" className={`${CTA} border border-white/14 bg-white/8 text-[#F3F5F9] hover:bg-white/14`}>
                See programs <ArrowRight aria-hidden className="size-4" />
              </Link>
            </div>
            <HeroStats />
          </div>
          <LiveRelay />
        </div>
      </section>

      <section aria-labelledby="offers-h" className="mx-auto max-w-[1180px] px-6 pt-16 pb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow font-extrabold text-brand-text">Programs</p>
            <h2 id="offers-h" className="headline-lg mt-1 text-[32px]">
              Open for enrollment
            </h2>
          </div>
          <Link href="/offers" className="text-sm font-extrabold">
            All programs →
          </Link>
        </div>
        <div className="mt-[22px]">
          <OfferGrid limit={3} />
        </div>
      </section>

      <WhoYouAreBuyingFrom />

      <section aria-labelledby="how-h" className="mx-auto max-w-[1180px] px-6 py-14">
        <p className="eyebrow font-extrabold text-brand-text">How it works</p>
        <h2 id="how-h" className="headline-lg mt-1 text-[32px]">
          From first question to a seat
        </h2>
        <ol className="mt-[26px] grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-[22px] border border-hair bg-panel p-5 shadow-card">
              <span className="inline-flex size-10 items-center justify-center rounded-[13px]" style={{ background: `var(--c-${s.agent}-bg)`, color: `var(--c-${s.agent})` }}>
                <s.icon aria-hidden className="size-[18px]" strokeWidth={2} />
              </span>
              <p className="mono mt-3.5 text-[11.5px] text-t4">0{i + 1}</p>
              <h3 className="mt-1 text-base font-extrabold">{s.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-[1.5] text-t3">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="trust-h" className="border-t border-hair bg-panel">
        <div className="mx-auto grid max-w-[1180px] grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-start gap-8 px-6 py-14">
          <div>
            <p className="eyebrow font-extrabold text-brand-text">Trust</p>
            <h2 id="trust-h" className="headline-lg mt-1 text-[30px] leading-[1.1]">
              What is real here, and what is not
            </h2>
            <p className="mt-3 leading-[1.5] text-t3">The agents do real work on fictional data. Money never does.</p>
          </div>
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-[22px] md:col-span-2">
            {TRUST.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-bg">
                  <Icon aria-hidden className="size-4 text-brand-text" strokeWidth={2.2} />
                </span>
                <span>
                  <dt className="text-[15px] font-extrabold">{title}</dt>
                  <dd className="mt-1 text-[13.5px] leading-[1.5] text-t3">{body}</dd>
                </span>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#0B1730] text-[#F3F5F9]">
        <div aria-hidden className="pointer-events-none absolute -top-[200px] -right-[100px] size-[520px] rounded-full bg-[radial-gradient(circle,rgba(245,166,35,.2),transparent_65%)]" />
        <div className="relative mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-6 px-6 py-14">
          <p className="max-w-[560px] text-[26px] leading-[1.2] font-extrabold tracking-[-.025em]">
            Not sure where to start? Tell the assistant what you do today and where you want to be.
          </p>
          <Link href="/assistant" className={`${CTA} bg-[#F5A623] text-[#0B1730] shadow-[0_10px_28px_rgba(245,166,35,.35)]`}>
            <Mic aria-hidden className="size-[17px]" strokeWidth={2.2} /> Talk to the assistant
          </Link>
        </div>
      </section>
    </>
  );
}
