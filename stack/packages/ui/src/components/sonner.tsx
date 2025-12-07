"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { Spinner } from "@workspace/ui/components/spinner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Spinner className="size-4 relative" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "w-full flex items-center gap-3 px-4 py-3 border shadow-lg bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] border-zinc-200/10 shadow-black/20 text-zinc-200",
          title: "text-sm font-medium ml-2",
          description: "text-xs text-zinc-400",
          icon: "relative shrink-0",
          loader: "relative shrink-0",
          success: "border-green-800/30 [&_svg]:text-green-400",
          error: "border-red-800/30 [&_svg]:text-red-400",
          warning: "border-amber-800/30 [&_svg]:text-amber-400",
          info: "border-blue-800/30 [&_svg]:text-blue-400",
          loading: "border-zinc-700/50 [&_svg]:text-zinc-400",
          actionButton: "bg-zinc-800 text-zinc-200 text-xs px-2 py-1 border border-zinc-700 hover:bg-zinc-700 transition-colors",
          cancelButton: "bg-transparent text-zinc-400 text-xs px-2 py-1 hover:text-zinc-200 transition-colors",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
