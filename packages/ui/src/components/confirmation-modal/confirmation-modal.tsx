"use client";

import { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";

export interface ConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  variant?: "default" | "danger";
  isLoading?: boolean;
}

export const ConfirmationModal = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  variant = "default",
  isLoading = false,
}: ConfirmationModalProps) => {
  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
            className="transition-all text-xs uppercase tracking-wider border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
          >
            {cancelLabel}
          </Button>
          <Button
            variant="outline"
            onClick={handleConfirm}
            disabled={isLoading}
            className={cn(
              "transition-all text-xs uppercase tracking-wider",
              variant === "danger"
                ? "border-red-900/60 text-red-400/80 hover:text-red-300 hover:border-red-700 hover:bg-red-950/30"
                : "border-zinc-600 text-zinc-200 hover:text-zinc-100 hover:border-zinc-400 hover:bg-zinc-800"
            )}
          >
            {isLoading ? "Loading..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
