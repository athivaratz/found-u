export type ArticleSection = "blog" | "help";
export type ArticleStatus = "draft" | "published";

export type Article = {
  id: string;
  slug: string;
  section: ArticleSection;
  status: ArticleStatus;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  author_name: string | null;
  tags: string[];
  content_json: TipTapDoc;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TipTapMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

export type TipTapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  marks?: TipTapMark[];
  text?: string;
};

export type TipTapDoc = {
  type: "doc";
  content?: TipTapNode[];
};

export const EMPTY_DOC: TipTapDoc = { type: "doc", content: [] };

export const CODE_LANGUAGES = [
  { id: "plaintext", label: "Plain text" },
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "tsx", label: "TSX" },
  { id: "jsx", label: "JSX" },
  { id: "bash", label: "Bash" },
  { id: "shell", label: "Shell" },
  { id: "json", label: "JSON" },
  { id: "sql", label: "SQL" },
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "python", label: "Python" },
  { id: "markdown", label: "Markdown" },
  { id: "yaml", label: "YAML" },
] as const;

export function slugifyTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0e00-\u0e7f]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled";
}
