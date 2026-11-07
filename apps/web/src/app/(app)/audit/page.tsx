import { Suspense } from "react";
import { AuditPage } from "@/features/audit/audit-page";

export const metadata = { title: "Audit log" };

export default function Page() {
  return (
    <Suspense>
      <AuditPage />
    </Suspense>
  );
}
