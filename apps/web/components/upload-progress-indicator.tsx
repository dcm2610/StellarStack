"use client";

import { useUploads } from "@/components/upload-provider";
import { Upload, X, ArrowUp } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { motion } from "framer-motion";

export function UploadProgressIndicator() {
  const { uploads, removeUpload } = useUploads();

  if (uploads.length === 0) return null;

  const totalProgress = uploads.reduce((sum, upload) => sum + upload.progress, 0) / uploads.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2 }}
      className="fixed top-4 right-4 z-50"
    >
      <div
        className={cn(
          "flex items-center gap-3 border px-4 py-3 shadow-lg backdrop-blur-sm",
          "border-blue-500/30 bg-blue-900/90"
        )}
      >
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-blue-400" />
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">
                Uploading {uploads.length} file{uploads.length !== 1 ? "s" : ""}
              </span>
              <span className="text-xs text-blue-300">{Math.round(totalProgress)}%</span>
            </div>
            {uploads.length === 1 && uploads[0]?.speed && (
              <div className="flex items-center gap-1 text-[10px] text-blue-300">
                <ArrowUp className="h-3 w-3" />
                <span>{uploads[0].speed}</span>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={() => {
            uploads.forEach((upload) => removeUpload(upload.id));
          }}
          className="rounded p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          title="Cancel all uploads"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}
