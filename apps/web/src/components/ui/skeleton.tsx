import { cn } from "cn"

/** Loading placeholder: --panel3 with the 1.4s shimmer (README "Loading"). */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("anim-shimmer rounded-lg", className)}
      {...props}
    />
  )
}

export { Skeleton }
