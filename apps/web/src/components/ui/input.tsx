import * as React from "react"
import { cn } from "cn"

/** Trackify input: --input fill + --hair border, radius 12, 36px default. `size="lg"` = 44px app forms, `size="auth"` = 46px. */
function Input({
  className,
  type,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"input">, "size"> & { size?: "default" | "lg" | "auth" }) {
  return (
    <input
      type={type}
      data-slot="input"
      data-size={size}
      className={cn(
        "w-full min-w-0 rounded-xl border border-hair bg-input px-3 text-sm text-text transition-[border-color,box-shadow] outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-text placeholder:text-t4 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/35 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-danger/25 data-[size=default]:h-9 data-[size=lg]:h-11 data-[size=auth]:h-[46px] data-[size=auth]:px-3.5",
        className
      )}
      {...props}
    />
  )
}

export { Input }
