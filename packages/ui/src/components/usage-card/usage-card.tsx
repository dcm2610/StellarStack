import { ComponentPropsWithoutRef } from "react";
import { cn } from "@workspace/ui/lib/utils";

type CardProps = ComponentPropsWithoutRef<"div">;

const UsageCardTitle = ({ className, children, ...props }: CardProps) => {
    return (
        <div className={cn(
            "text-2xl font-light mb-6",
            "text-zinc-100",
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

const UsageCardFooter = ({ className, children, ...props }: CardProps) => {
    return (
        <div
            className={cn(
                "mt-6 pt-4 border-t text-sm",
                "border-zinc-700 text-zinc-400",
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
};

const UsageCard = ({ className, children, ...props }: CardProps) => {
    return (
        <div className={cn(
            "relative p-8 border flex flex-col transition-colors",
            "bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] border-zinc-200/10 shadow-lg shadow-black/20",
            className
        )} {...props}>
            <div className={cn(
                "absolute top-0 left-0 w-3 h-3 border-t border-l",
                "border-zinc-500"
            )}></div>
            <div className={cn(
                "absolute top-0 right-0 w-3 h-3 border-t border-r",
                "border-zinc-500"
            )}></div>
            <div className={cn(
                "absolute bottom-0 left-0 w-3 h-3 border-b border-l",
                "border-zinc-500"
            )}></div>
            <div className={cn(
                "absolute bottom-0 right-0 w-3 h-3 border-b border-r",
                "border-zinc-500"
            )}></div>
            {children}
        </div>
    );
};

UsageCard.Title = UsageCardTitle;
UsageCard.Content = UsageCardContent;
UsageCard.Footer = UsageCardFooter;

export { UsageCard, UsageCardContent, UsageCardTitle, UsageCardFooter };