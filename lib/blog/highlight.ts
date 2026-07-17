import { createHighlighter, type Highlighter } from "shiki";

let highlighterPromise: Promise<Highlighter> | null = null;

const LANGS = [
  "javascript",
  "typescript",
  "tsx",
  "jsx",
  "bash",
  "shell",
  "json",
  "sql",
  "html",
  "css",
  "python",
  "markdown",
  "yaml",
  "plaintext",
] as const;

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-dark", "github-light"],
      langs: [...LANGS],
    });
  }
  return highlighterPromise;
}

export async function highlightCode(
  code: string,
  language: string
): Promise<string> {
  const highlighter = await getHighlighter();
  const langs = highlighter.getLoadedLanguages();
  const lang = langs.includes(language as (typeof LANGS)[number])
    ? language
    : "plaintext";

  return highlighter.codeToHtml(code, {
    lang,
    themes: {
      light: "github-light",
      dark: "github-dark",
    },
    defaultColor: false,
  });
}
