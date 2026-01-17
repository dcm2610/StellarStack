"use client"

import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"
import { CheckIcon } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

interface SwitchProps extends React.ComponentProps<typeof SwitchPrimitive.Root> {}

const Switch = ({
  className,
  ...props
}: SwitchProps) => {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer relative inline-flex h-6 w-12 shrink-0 cursor-pointer items-center border transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50",
        // Checked state
        "data-[state=checked]:bg-green-500/20 data-[state=checked]:border-green-500/50",
        // Unchecked state - dark mode
        "data-[state=unchecked]:bg-zinc-800 data-[state=unchecked]:border-zinc-700",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none absolute top-[3px] flex h-4 w-4 items-center justify-center transition-all",
          // Checked state
          "data-[state=checked]:left-[27px] data-[state=checked]:bg-green-500",
          // Unchecked state
          "data-[state=unchecked]:left-[3px] data-[state=unchecked]:bg-zinc-500"
        )}
      >
        <CheckIcon
          className={cn(
            "h-3 w-3 text-white transition-opacity",
            "[[data-state=checked]_&]:opacity-100",
            "[[data-state=unchecked]_&]:opacity-0"
          )}
        />
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  );
};

export { Switch }
