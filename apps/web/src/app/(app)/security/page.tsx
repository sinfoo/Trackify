import { Suspense } from "react";
import { PageGuard } from "@/features/security/shared";
import { SecurityPage } from "@/features/security/security-page";

export const metadata = { title: "Security" };

export default function Page() {
  return (
    <Suspense>
      <PageGuard perm="security:read" title="Security">
        <SecurityPage />
      </PageGuard>
    </Suspense>
  );
}
