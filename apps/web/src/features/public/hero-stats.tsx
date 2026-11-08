"use client";

import { useBusiness } from "./business";
import { useOffers } from "./offers";

/** Hero numbers under the CTAs: programs open (API), learners trained (business profile), agents. */
export function HeroStats() {
  const { data } = useOffers();
  const { biz } = useBusiness();
  const open = (data ?? []).filter((o) => o.status === "ACTIVE" || !o.status).length;
  const stats: [string, string][] = [
    [open ? String(open) : "7", "programs open"],
    [biz.learners, "learners trained"],
    ["6", "AI agents, 1 human reviewer"],
  ];
  return (
    <dl className="mt-[34px] flex flex-wrap gap-7">
      {stats.map(([v, k]) => (
        <div key={k}>
          <dd className="tabular block text-[26px] font-extrabold tracking-[-.03em]">{v}</dd>
          <dt className="mt-0.5 block text-[12.5px] text-[rgba(243,245,249,.6)]">{k}</dt>
        </div>
      ))}
    </dl>
  );
}
