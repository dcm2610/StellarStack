"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { ArrowLeft, Save, Loader2, File } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { FadeIn } from "@workspace/ui/components/fade-in";
import { Spinner } from "@workspace/ui/components/spinner";
import { CodeEditor, detectLanguage } from "@/components/code-editor";
import { useFileContent, useFileMutations } from "@/hooks/queries";
import { useServer } from "@/components/server-provider";

export default function FileEditPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const serverId = params.id as string;
  const filePath = searchParams.get("path") || "";
  const fileName = filePath.split("/").pop() || "file";

  const { server } = useServer();

  // Fetch file content
  const { data: originalContent, isLoading, error } = useFileContent(serverId, filePath);

  // File mutations
  const { write } = useFileMutations(serverId);

  // Local state for editing
  const [content, setContent] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Set initial content when loaded
  useEffect(() => {
    if (originalContent !== undefined) {
      setContent(originalContent);
      setHasChanges(false);
    }
  }, [originalContent]);

  // Track changes
  const handleContentChange = useCallback(
    (newContent: string) => {
      setContent(newContent);
      setHasChanges(newContent !== originalContent);
    },
    [originalContent]
  );

  // Handle save
  const handleSave = async () => {
    try {
      await write.mutateAsync({ path: filePath, content });
      setHasChanges(false);
      toast.success("File saved successfully");
    } catch (err) {
      toast.error("Failed to save file");
      console.error("Save error:", err);
    }
  };

  // Handle back navigation
  const handleBack = () => {
    if (hasChanges) {
      const confirmed = window.confirm("You have unsaved changes. Are you sure you want to leave?");
      if (!confirmed) return;
    }

    // Navigate back to files page
    const parentPath = filePath.split("/").slice(0, -1).join("/");
    router.push(`/servers/${serverId}/files${parentPath ? `/${parentPath}` : ""}`);
  };

  // Warn on page unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasChanges]);

  const isDark = mounted ? resolvedTheme === "dark" : true;
  const language = detectLanguage(fileName);

  const fileExtension = fileName.split(".").pop()?.toLowerCase() || "";
  const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(
    fileExtension
  );
  const isVideo = ["mp4", "webm", "mov", "avi", "mkv", "flv", "wmv", "m4v", "3gp", "ogv"].includes(
    fileExtension
  );
  const isAudio = ["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma", "opus", "aiff", "au"].includes(
    fileExtension
  );
  const isMedia = isImage || isVideo || isAudio;

  if (!mounted) {
    return null;
  }

  return (
    <div className={cn("relative min-h-screen", isDark ? "bg-black" : "bg-zinc-50")}>
      {/* Background is now rendered in the layout for persistence */}

      <div className="relative z-10 flex h-screen flex-col">
        {/* Header */}
        <FadeIn>
          <header
            className={cn(
              "flex items-center justify-between border-b px-6 py-4",
              isDark ? "border-zinc-800 bg-black/50" : "border-zinc-200 bg-white/50"
            )}
          >
            <div className="flex items-center gap-4">
              <button
                onClick={handleBack}
                className={cn(
                  "p-2 transition-colors",
                  isDark
                    ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                )}
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "border p-2",
                    isDark ? "border-zinc-700 bg-zinc-800" : "border-zinc-300 bg-zinc-100"
                  )}
                >
                  <File className={cn("h-5 w-5", isDark ? "text-zinc-400" : "text-zinc-600")} />
                </div>
                <div>
                  <h1
                    className={cn("text-lg font-medium", isDark ? "text-white" : "text-zinc-900")}
                  >
                    {fileName}
                  </h1>
                  <p className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-500")}>
                    {filePath}
                  </p>
                </div>
              </div>

              {hasChanges && (
                <span
                  className={cn(
                    "border px-2 py-1 text-xs",
                    isDark ? "border-zinc-600 text-zinc-400" : "border-zinc-400 text-zinc-600"
                  )}
                >
                  Unsaved changes
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "border px-2 py-1 text-xs tracking-wider uppercase",
                  isDark ? "border-zinc-700 text-zinc-400" : "border-zinc-300 text-zinc-600"
                )}
              >
                {language}
              </span>

              <button
                onClick={handleSave}
                disabled={!hasChanges || write.isPending}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors",
                  hasChanges && !write.isPending
                    ? isDark
                      ? "bg-white text-black hover:bg-zinc-200"
                      : "bg-zinc-900 text-white hover:bg-zinc-800"
                    : isDark
                      ? "cursor-not-allowed bg-zinc-800 text-zinc-500"
                      : "cursor-not-allowed bg-zinc-200 text-zinc-400"
                )}
              >
                {write.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save
              </button>
            </div>
          </header>
        </FadeIn>

        {/* Editor */}
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner className="h-8 w-8" />
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <p className={cn("text-lg", isDark ? "text-red-400" : "text-red-600")}>
                Failed to load file
              </p>
              <button
                onClick={handleBack}
                className={cn(
                  "px-4 py-2 text-sm",
                  isDark
                    ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300"
                )}
              >
                Go back
              </button>
            </div>
          ) : isMedia ? (
            <div className="flex h-full items-center justify-center p-8">
              <div className="flex flex-col items-center gap-6">
                {isImage && (
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative max-h-[70vh] max-w-full overflow-auto rounded-lg border-2 border-zinc-700/30">
                      <img
                        src={`data:${fileExtension === "svg" ? "image/svg+xml" : `image/${fileExtension}`};base64,${btoa(originalContent || "")}`}
                        alt={fileName}
                        className="h-auto max-w-full"
                      />
                    </div>
                  </div>
                )}

                {isVideo && (
                  <div className="flex w-full max-w-4xl flex-col items-center gap-4">
                    <div className="w-full overflow-hidden rounded-lg border-2 border-zinc-700/30">
                      <video controls className="w-full" preload="metadata">
                        <source
                          src={`data:video/${fileExtension};base64,${originalContent || ""}`}
                          type={`video/${fileExtension}`}
                        />
                        Your browser does not support the video tag.
                      </video>
                    </div>
                  </div>
                )}

                {isAudio && (
                  <div className="flex w-full max-w-2xl flex-col items-center gap-6">
                    <div className="w-full rounded-xl border-2 border-zinc-700/30 p-12">
                      <audio controls className="w-full" preload="metadata">
                        <source
                          src={`data:audio/${fileExtension};base64,${originalContent || ""}`}
                          type={`audio/${fileExtension}`}
                        />
                        Your browser does not support the audio tag.
                      </audio>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <CodeEditor
              value={content}
              onChange={handleContentChange}
              filename={fileName}
              isDark={isDark}
              height="100%"
              className="h-full rounded-none border-0"
            />
          )}
        </div>
      </div>
    </div>
  );
}
