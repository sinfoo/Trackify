import { Suspense } from "react";
import { PageGuard } from "@/features/security/shared";
import { ApprovalsPage } from "@/features/approvals/approvals-page";

export const metadata = { title: "Approvals" };

export default function Page() {
  return (
    <Suspense>
      <PageGuard perm="approvals:read" title="Approvals">
        <ApprovalsPage />
      </PageGuard>
    </Suspense>
  );
}
