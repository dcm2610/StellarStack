"use client";

import type { JSX } from "react";
import { cn } from "@workspace/ui/lib/utils";
import { UsageCard } from "../usage-card";
import type { CardProps } from "../dashboard-cards-types";

interface InstanceNameCardProps extends CardProps {
  instanceName: string;
}

export const InstanceNameCard = ({ instanceName }: InstanceNameCardProps): JSX.Element => {
  return (
    <UsageCard className="h-full flex items-center justify-center">
      <div className={cn("text-2xl font-mono uppercase", "text-zinc-400")}>
        {instanceName}
      </div>
    </UsageCard>
  );
};
