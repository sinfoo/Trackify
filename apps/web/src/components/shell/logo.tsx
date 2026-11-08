import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Trackify lock-up: the mark (rounded square, radius ~30%) + wordmark "Trackify" in Manrope 800 where the dot of
 * the i is an amber circle (dotless ı + positioned 0.17em dot), tagline "Autonomous FinTech Team".
 * `inverted` = on the always-dark sidebar / brand panels. `compact` = mark only.
 */
export function Logo({
  size = 38,
  compact,
  inverted,
  href = "/",
  tagline = true,
  className,
}: {
  size?: number;
  compact?: boolean;
  inverted?: boolean;
  href?: string | null;
  tagline?: boolean;
  className?: string;
}) {
  const inner = (
    <>
      <Image
        src="/brand/trackify-mark.png"
        alt=""
        width={size}
        height={size}
        priority
        className="shrink-0 shadow-[0_6px_18px_rgba(245,166,35,.25)]"
        style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
      />
      {!compact && (
        <span className="leading-[1.15] whitespace-nowrap">
          <Wordmark className={cn("block text-[15px]", inverted ? "text-[#F3F5F9]" : "text-text")} />
          {tagline && <span className={cn("mt-0.5 block text-xs", inverted ? "text-[#8A97B3]" : "text-t3")}>Autonomous FinTech Team</span>}
        </span>
      )}
    </>
  );
  const cls = cn("inline-flex items-center gap-3 text-inherit no-underline hover:no-underline", className);
  if (href === null) return <span className={cls}>{inner}</span>;
  return (
    <Link href={href} className={cls} aria-label="Trackify, home">
      {inner}
    </Link>
  );
}

/** "Track" + dotless ı + amber dot + "fy". Inherits font-size/colour; use `inverted` colours via className. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-extrabold tracking-[-0.01em]", className)} aria-label="Trackify">
      <span aria-hidden>Track</span>
      <span aria-hidden className="relative inline-block">
        ı
        <span className="absolute top-[.06em] left-1/2 size-[.17em] -translate-x-1/2 rounded-full bg-[#F5A623]" />
      </span>
      <span aria-hidden>fy</span>
    </span>
  );
}
