import type { ReactNode } from "react";
import { BrandPanel } from "@/components/auth/brand-panel";

/**
 * Prototype auth frame: two `flex: 1 1 460px` columns, `wrap-reverse` so on narrow screens the form (second
 * in DOM) stacks above the always-dark brand panel. Each form sets its own max-width (420 / 560 register).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-wrap-reverse items-stretch">
      <BrandPanel />
      <section className="flex min-w-0 flex-[1_1_460px] items-center justify-center bg-bg px-6 py-10">{children}</section>
    </div>
  );
}
