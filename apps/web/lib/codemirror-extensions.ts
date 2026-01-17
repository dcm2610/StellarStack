import { Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, indentOnInput } from "@codemirror/language";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";

export type SupportedLanguage = "json" | "yaml" | "markdown" | "shell" | "properties" | "text";

/**
 * Detect language from file extension
 */
export const detectLanguage = (filename: string): SupportedLanguage => {
  const ext = filename.toLowerCase().split(".").pop() || "";

  switch (ext) {
    case "json":
      return "json";
    case "yml":
    case "yaml":
      return "yaml";
    case "md":
    case "markdown":
      return "markdown";
    case "sh":
    case "bash":
    case "bat":
    case "cmd":
      return "shell";
    case "properties":
    case "conf":
    case "cfg":
    case "ini":
    case "toml":
      return "properties";
    default:
      return "text";
  }
};

/**
 * Get language extension based on language type
 */
export const getLanguageExtension = (language: SupportedLanguage): Extension | null => {
  switch (language) {
    case "json":
      return json();
    case "yaml":
      return yaml();
    case "markdown":
      return markdown();
    case "shell":
    case "properties":
    case "text":
    default:
      return null;
  }
};

/**
 * Dark theme for CodeMirror (always dark mode, no light mode support)
 */
export const darkTheme = oneDark;

/**
 * Theme extension for proper scrolling
 */
const scrollableTheme = EditorView.theme({
  "&": {
    height: "100%",
  },
  ".cm-scroller": {
    overflow: "auto",
  },
});

/**
 * Base extensions for all editor instances
 */
export const getBaseExtensions = (readOnly: boolean = false): Extension[] => {
  const extensions: Extension[] = [
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    history(),
    foldGutter(),
    bracketMatching(),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    darkTheme,
    scrollableTheme,
    EditorView.lineWrapping,
  ];

  if (readOnly) {
    extensions.push(EditorView.editable.of(false));
  }

  return extensions;
};

/**
 * Get all extensions for a file
 */
export const getExtensionsForFile = (
  filename: string,
  readOnly: boolean = false
): Extension[] => {
  const language = detectLanguage(filename);
  const extensions = getBaseExtensions(readOnly);

  const langExt = getLanguageExtension(language);
  if (langExt) {
    extensions.push(langExt);
  }

  return extensions;
};
