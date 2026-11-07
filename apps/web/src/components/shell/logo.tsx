import Link from "next/link";
import { cn } from "@/lib/utils";

/** Wordmark: orange tile + "TECHX Agents". `inverted` = on navy. `railAtMd` hides the text between md and lg. */
export function Logo({
  compact,
  inverted,
  railAtMd,
  href = "/",
}: {
  compact?: boolean;
  inverted?: boolean;
  railAtMd?: boolean;
  href?: string;
}) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 rounded-md" aria-label="TECHX Autonomous FinTech Team, home">
      <span
        aria-hidden
        className="num inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground"
      >
        TX
      </span>
      {!compact && (
        <span className={cn("leading-tight", railAtMd && "hidden lg:block")}>
          <span className={cn("block text-sm font-semibold", inverted ? "text-sidebar-accent-foreground" : "text-foreground")}>
            TECHX Agents
          </span>
          <span className={cn("block text-xs", inverted ? "text-sidebar-muted" : "text-muted-foreground")}>
            Autonomous FinTech Team
          </span>
        </span>
      )}
    </Link>
  );
}
