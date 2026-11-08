"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

/** Prototype toast: bottom-centre, 46px, radius 14, #0B1730 on both themes, 14/700, slides up, auto-dismiss 2.4s. */
const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme = "dark" } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme as ToasterProps["theme"]}
      position="bottom-center"
      duration={2400}
      offset={28}
      gap={8}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-[18px] text-success" strokeWidth={2.2} />,
        info: <InfoIcon className="size-[18px] text-info" strokeWidth={2.2} />,
        warning: <TriangleAlertIcon className="size-[18px] text-warning" strokeWidth={2.2} />,
        error: <OctagonXIcon className="size-[18px] text-danger" strokeWidth={2.2} />,
        loading: <Loader2Icon className="size-[18px] animate-spin text-t3" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-max max-w-[calc(100vw-32px)] items-center gap-2.5 min-h-[46px] rounded-[14px] border border-white/10 bg-[#0B1730] py-2 pr-[18px] pl-3.5 text-sm font-bold text-[#F3F5F9] shadow-[0_16px_40px_rgba(0,0,0,.35)]",
          content: "flex flex-col gap-0 leading-tight",
          title: "text-sm font-bold",
          description: "text-xs font-medium text-[#B8C2D9]",
          icon: "flex shrink-0 items-center",
          actionButton: "ml-2 h-7 rounded-full bg-text px-2.5 text-xs font-bold text-bg",
          cancelButton: "ml-2 h-7 rounded-full border border-hair bg-panel2 px-2.5 text-xs font-bold text-text",
          closeButton: "hidden",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
