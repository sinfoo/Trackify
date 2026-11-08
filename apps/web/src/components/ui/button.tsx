import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

/**
 * Trackify buttons: radius 10-12px, 36px min height (44px lg / 46px auth), 13.5/700.
 * default = amber --brand with --on-brand text; outline/ghost = hairline + --panel2; destructive = danger ghost.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-[10px] border border-transparent bg-clip-padding text-[13.5px] font-bold whitespace-nowrap transition-[background-color,border-color,color,transform,box-shadow] duration-200 outline-none select-none focus-visible:ring-2 focus-visible:ring-brand/35 focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-brand text-on-brand shadow-brand hover:brightness-105 hover:-translate-y-px font-extrabold",
        outline: "border-hair bg-panel2 text-text hover:bg-panel3 aria-expanded:bg-panel3",
        secondary: "bg-text text-bg hover:opacity-90 aria-expanded:opacity-90",
        ghost: "text-text hover:bg-panel2 aria-expanded:bg-panel2",
        destructive: "border-danger/40 bg-danger-bg text-danger hover:border-danger focus-visible:ring-danger/35",
        link: "h-auto rounded-none px-0 text-brand-text underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-7 gap-1 rounded-lg px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 rounded-[9px] px-3 text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-2 rounded-xl px-[18px] text-sm",
        xl: "h-[46px] gap-2 rounded-xl px-5 text-sm",
        icon: "size-9",
        "icon-xs": "size-7 rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-[9px]",
        "icon-lg": "size-11 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
