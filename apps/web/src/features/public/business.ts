"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BUSINESS } from "@/lib/fixtures";
import type { BusinessPublic } from "@/lib/types";

/** Fixture shape -> API shape, used only when GET /public/business fails. */
export const BUSINESS_FALLBACK: BusinessPublic = {
  name: BUSINESS.name,
  legal_name: BUSINESS.legal,
  tagline: BUSINESS.tagline,
  about: BUSINESS.about,
  founded: BUSINESS.founded,
  city: BUSINESS.city,
  address: BUSINESS.address,
  phone: BUSINESS.phone,
  email: BUSINESS.email,
  support_email: BUSINESS.support,
  website: BUSINESS.website,
  registration: BUSINESS.registration,
  tax_id: BUSINESS.taxId,
  refund_policy: BUSINESS.refund,
  learners: BUSINESS.learners,
  instructors: BUSINESS.instructors,
  rating: BUSINESS.rating,
  accreditations: BUSINESS.accreditations,
  support_hours: BUSINESS.hours,
};

export const businessKey = ["public", "business"] as const;

/** Always returns a profile: the API's, or the fixture while loading / on error. `fallback` tells which. */
export function useBusiness(): { biz: BusinessPublic; fallback: boolean } {
  const q = useQuery({
    queryKey: businessKey,
    queryFn: () => api.get<BusinessPublic>("/public/business", { noAuthRedirect: true }),
    staleTime: 5 * 60_000,
  });
  return { biz: q.data ?? BUSINESS_FALLBACK, fallback: !q.data };
}

/** First sentence of the refund policy ("Full refund within 14 days of enrollment, or before the second session, whichever comes first."). */
export const refundShort = (biz: BusinessPublic) => biz.refund_policy.split(". ")[0].replace(/\.?$/, ".");
