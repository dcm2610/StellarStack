"use client";

import { useState, useCallback, type DragEvent } from "react";
import { cn } from "@workspace/ui/lib/utils";
import { BsCloudUpload } from "react-icons/bs";
import type { DropZoneProps, UploadButtonProps } from "../animations-types";

export type { DropZoneProps, UploadButtonProps };

export const DropZone = ({
  children,
  onDrop,
  onDragEnter,
  onDragLeave,
  className,
  acceptedTypes,
  disabled = false,
}: DropZoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);

  const handleDragEnter = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;

      setDragCounter((prev) => prev + 1);
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        setIsDragging(true);
        onDragEnter?.();
      }
    },
    [disabled, onDragEnter]
  );

  const handleDragLeave = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;

      setDragCounter((prev) => {
        const newCount = prev - 1;
        if (newCount === 0) {
          setIsDragging(false);
          onDragLeave?.();
        }
        return newCount;
      });
    },
    [disabled, onDragLeave]
  );

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
    },
    []
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;

      setIsDragging(false);
      setDragCounter(0);

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        // Filter by accepted types if specified
        if (acceptedTypes && acceptedTypes.length > 0) {
          const validFiles = Array.from(files).filter((file) =>
            acceptedTypes.some(
              (type) =>
                file.type === type ||
                file.name.endsWith(type.replace("*", ""))
            )
          );
          if (validFiles.length > 0) {
            const dataTransfer = new DataTransfer();
            validFiles.forEach((file) => dataTransfer.items.add(file));
            onDrop?.(dataTransfer.files);
          }
        } else {
          onDrop?.(files);
        }
      }
    },
    [disabled, acceptedTypes, onDrop]
  );

  return (
    <div
      className={cn("relative", className)}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}

      {/* Drag overlay */}
      <div
        className={cn(
          "absolute inset-0 z-50 flex items-center justify-center transition-all duration-200 pointer-events-none",
          isDragging ? "opacity-100" : "opacity-0"
        )}
      >
        <div
          className={cn(
            "absolute inset-0",
            "bg-zinc-900/90"
          )}
        />
        <div
          className={cn(
            "absolute inset-4 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-4",
            "border-blue-500/50 bg-blue-500/5"
          )}
        >
          <div
            className={cn(
              "p-4 rounded-full",
              "bg-blue-500/20"
            )}
          >
            <BsCloudUpload className="w-12 h-12 text-blue-500 animate-bounce" />
          </div>
          <div className="text-center">
            <p
              className={cn(
                "text-lg font-medium",
                "text-zinc-100"
              )}
            >
              Drop files to upload
            </p>
            <p
              className={cn(
                "text-sm mt-1",
                "text-zinc-400"
              )}
            >
              Release to start uploading
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Compact upload button with progress
export const UploadButton = ({
  onSelect,
  accept,
  multiple = true,
  className,
  children,
  progress = 0,
  isUploading = false,
}: UploadButtonProps) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onSelect?.(e.target.files);
    }
    e.target.value = "";
  };

  return (
    <label
      className={cn(
        "relative inline-flex items-center gap-2 px-4 py-2 cursor-pointer transition-all overflow-hidden",
        "bg-zinc-800 hover:bg-zinc-700 text-zinc-200",
        isUploading && "cursor-wait",
        className
      )}
    >
      {/* Progress bar */}
      {isUploading && (
        <div
          className="absolute inset-0 bg-blue-500/20 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      )}
      <input
        type="file"
        className="sr-only"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        disabled={isUploading}
      />
      <span className="relative z-10 flex items-center gap-2">
        {children || (
          <>
            <BsCloudUpload className="w-4 h-4" />
            <span className="text-sm font-medium">
              {isUploading ? `${Math.round(progress)}%` : "Upload"}
            </span>
          </>
        )}
      </span>
    </label>
  );
};
