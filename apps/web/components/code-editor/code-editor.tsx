"use client";

import { useEffect, useRef, useCallback } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { cn } from "@workspace/ui/lib/utils";
import {
  detectLanguage,
  getExtensionsForFile,
  SupportedLanguage,
} from "@/lib/codemirror-extensions";

export interface CodeEditorProps {
  /** Current content of the editor */
  value: string;
  /** Called when content changes */
  onChange?: (value: string) => void;
  /** Language for syntax highlighting (auto-detected from filename if not provided) */
  language?: SupportedLanguage;
  /** Filename used for language detection and display */
  filename?: string;
  /** Whether the editor is read-only */
  readOnly?: boolean;
  /** Height of the editor (defaults to 100%) */
  height?: string | number;
  /** Additional class names */
  className?: string;
  /** Placeholder text when empty */
  placeholder?: string;
}

export const CodeEditor = ({
  value,
  onChange,
  language,
  filename = "file.txt",
  readOnly = false,
  height = "100%",
  className,
}: CodeEditorProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  // Keep onChange ref up to date
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Determine the language to use
  const effectiveLanguage = language || detectLanguage(filename);

  // Create or update the editor
  useEffect(() => {
    if (!containerRef.current) return;

    // Destroy existing view
    if (viewRef.current) {
      viewRef.current.destroy();
    }

    // Create update listener
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && onChangeRef.current) {
        onChangeRef.current(update.state.doc.toString());
      }
    });

    // Get extensions (hardcoded to dark theme)
    const extensions = getExtensionsForFile(filename, readOnly);
    extensions.push(updateListener);

    // Create state
    const state = EditorState.create({
      doc: value,
      extensions,
    });

    // Create view
    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [filename, readOnly, effectiveLanguage]);

  // Update content when value changes externally
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentContent = view.state.doc.toString();
    if (currentContent !== value) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: value,
        },
      });
    }
  }, [value]);

  const heightStyle = typeof height === "number" ? `${height}px` : height;

  return (
    <div
      ref={containerRef}
      className={cn(
        "border border-zinc-700 bg-zinc-900",
        className
      )}
      style={{
        height: heightStyle,
        minHeight: "200px",
      }}
    />
  );
};

export { detectLanguage, type SupportedLanguage };
