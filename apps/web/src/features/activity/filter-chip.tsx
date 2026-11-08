import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Prototype filter chip: 32–34px, radius 999, hairline; selected = --text fill with --bg text. */
export function FilterChip({
  on,
  onClick,
  count,
  size = 34,
  className,
  children,
}: {
  on: boolean;
  onClick: () => void;
  count?: number;
  size?: 32 | 34;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-[7px] rounded-full border px-3 font-bold whitespace-nowrap transition-[background-color,color,border-color] duration-200",
        size === 34 ? "h-[34px] text-[13px]" : "h-8 text-[12.5px]",
        on ? "border-text bg-text text-bg" : "border-hair bg-panel text-t2 hover:bg-panel2",
        className,
      )}
    >
      {children}
      {count !== undefined && <span className="tabular opacity-70">{count}</span>}
    </button>
  );
}
