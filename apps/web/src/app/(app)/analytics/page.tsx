import { Suspense } from "react";
import { AnalyticsView } from "@/features/analytics/analytics-view";

export const metadata = { title: "Analytics" };

export default function Page() {
  return (
    <Suspense>
      <AnalyticsView />
    </Suspense>
  );
}
