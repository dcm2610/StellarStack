import { ComponentPropsWithoutRef } from "react";
import { cn } from "@workspace/ui/lib/utils";

type CardProps = ComponentPropsWithoutRef<"div"> & { isDark?: boolean };

const UsageCardTitle = ({ className, children, isDark = true, ...props }: CardProps) => {
    return (
        <div className={cn(
            "text-2xl font-light mb-6",
            isDark ? "text-zinc-100" : "text-zinc-800",
            className
        )} {...props}>
            {children}
        </div>
    );
};

const UsageCardContent = ({ className, children, ...props }: CardProps) => {
    return (
        <div className={cn("space-y-4 flex-1 flex flex-col", className)} {...props}>
            {children}
        </div>
    );
};

const UsageCardFooter = ({ className, children, isDark = true, ...props }: CardProps) => {
    return (
        <div
            className={cn(
                "mt-6 pt-4 border-t text-sm",
                isDark ? "border-zinc-700 text-zinc-400" : "border-zinc-300 text-zinc-600",
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
};

const UsageCard = ({ className, children, isDark = true, ...props }: CardProps) => {
    return (
        <div className={cn(
            "relative p-8 border flex flex-col transition-colors",
            isDark
                ? "bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] border-zinc-200/10 shadow-lg shadow-black/20"
                : "bg-gradient-to-b from-white via-zinc-50 to-zinc-100 border-zinc-300 shadow-lg shadow-zinc-400/20",
            className
        )} {...props}>
            <div className={cn(
                "absolute top-0 left-0 w-3 h-3 border-t border-l",
                isDark ? "border-zinc-500" : "border-zinc-400"
            )}></div>
            <div className={cn(
                "absolute top-0 right-0 w-3 h-3 border-t border-r",
                isDark ? "border-zinc-500" : "border-zinc-400"
            )}></div>
            <div className={cn(
                "absolute bottom-0 left-0 w-3 h-3 border-b border-l",
                isDark ? "border-zinc-500" : "border-zinc-400"
            )}></div>
            <div className={cn(
                "absolute bottom-0 right-0 w-3 h-3 border-b border-r",
                isDark ? "border-zinc-500" : "border-zinc-400"
            )}></div>
            {children}
        </div>
    );
};

UsageCard.Title = UsageCardTitle;
UsageCard.Content = UsageCardContent;
UsageCard.Footer = UsageCardFooter;

export { UsageCard, UsageCardContent, UsageCardTitle, UsageCardFooter };