"use client";

import { type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Moon, Sun } from "lucide-react";
import { ThemeProvider, useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const THEME_STORAGE_KEY = "trackify-theme";

/** Public site follows the system; the console and auth default to dark (README "Interactions"). */
const PUBLIC_PREFIXES = ["/offers", "/assistant", "/checkout", "/success", "/payment-failed"];
export function isPublicPath(pathname: string) {
  return pathname === "/" || PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * next-themes with the Trackify storage key and both `class` + `data-theme` attributes.
 * The default is only consulted when nothing is stored yet, so routing between groups keeps the user's choice.
 */
export function TrackifyThemeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <ThemeProvider
      attribute={["class", "data-theme"]}
      storageKey={THEME_STORAGE_KEY}
      defaultTheme={isPublicPath(pathname ?? "") ? "system" : "dark"}
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}

type Reveal = { ready: Promise<void> };
type DocWithVT = Document & { startViewTransition?: (cb: () => void) => Reveal };

/**
 * `{ theme, toggle }`. `toggle(e?)` flips dark/light with the View Transition circular reveal from the click
 * point (620ms cubic-bezier(.65,.05,.25,1), see ::view-transition-old in globals.css); instant swap without
 * the API or with reduced motion.
 */
export function useTrackifyTheme() {
  const { resolvedTheme, setTheme } = useTheme();
  const theme: "dark" | "light" = resolvedTheme === "light" ? "light" : "dark";

  const toggle = (e?: MouseEvent | ReactMouseEvent) => {
    const next = theme === "dark" ? "light" : "dark";
    const root = document.documentElement;
    const apply = () => {
      // Flip the DOM synchronously so the transition snapshot sees the new theme; next-themes' effect then agrees.
      root.classList.toggle("dark", next === "dark");
      root.classList.toggle("light", next === "light");
      root.dataset.theme = next;
      root.style.colorScheme = next;
      flushSync(() => setTheme(next));
    };
    const doc = document as DocWithVT;
    if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      apply();
      return;
    }
    const x = e?.clientX ?? window.innerWidth / 2;
    const y = e?.clientY ?? window.innerHeight / 2;
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    root.style.setProperty("--rvX", `${x}px`);
    root.style.setProperty("--rvY", `${y}px`);
    root.style.setProperty("--rvR", `${Math.ceil(r)}px`);
    doc.startViewTransition(apply);
  };

  return { theme, toggle };
}

/** 34px round sun/moon button. Icons swap via CSS so SSR never mismatches. */
export function ThemeToggle({ className, size = 34 }: { className?: string; size?: number }) {
  const { toggle } = useTrackifyTheme();
  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={toggle}
      style={{ width: size, height: size }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full border border-hair bg-panel2 text-t2 transition-colors hover:bg-panel3 [&_svg]:size-4",
        className,
      )}
    >
      <Sun aria-hidden className="hidden dark:block" />
      <Moon aria-hidden className="dark:hidden" />
    </button>
  );
}
