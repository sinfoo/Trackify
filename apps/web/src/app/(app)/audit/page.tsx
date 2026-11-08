import { Suspense } from "react";
import { PageGuard } from "@/features/security/shared";
import { AuditPage } from "@/features/audit/audit-page";

export const metadata = { title: "Audit log" };

export default function Page() {
  return (
    <Suspense>
      <PageGuard perm="audit:read" title="Audit log">
        <AuditPage />
      </PageGuard>
    </Suspense>
  );
}
