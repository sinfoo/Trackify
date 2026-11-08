import * as React from "react"
import { cn } from "cn"

/** Trackify textarea: --input fill, hairline, radius 12, 10px 12px padding, min 72px. */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-[72px] w-full rounded-xl border border-hair bg-input px-3 py-2.5 text-sm leading-normal text-text transition-[border-color,box-shadow] outline-none placeholder:text-t4 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/35 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-danger/25",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
