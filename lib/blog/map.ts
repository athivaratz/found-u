import type {
  Article,
  ArticleSection,
  ArticleStatus,
  TipTapDoc,
} from "@/lib/blog/types";
import { EMPTY_DOC } from "@/lib/blog/types";

export function asArticleSection(value: unknown): ArticleSection {
  return value === "help" ? "help" : "blog";
}

export function asArticleStatus(value: unknown): ArticleStatus {
  return value === "published" ? "published" : "draft";
}

export function asTipTapDoc(value: unknown): TipTapDoc {
  if (
    value &&
    typeof value === "object" &&
    (value as TipTapDoc).type === "doc"
  ) {
    return value as TipTapDoc;
  }
  return EMPTY_DOC;
}

export function mapArticle(row: Record<string, unknown>): Article {
  return {
    id: String(row.id ?? ""),
    slug: String(row.slug ?? ""),
    section: asArticleSection(row.section),
    status: asArticleStatus(row.status),
    title: String(row.title ?? ""),
    excerpt: row.excerpt == null ? null : String(row.excerpt),
    cover_image_url:
      row.cover_image_url == null ? null : String(row.cover_image_url),
    author_name: row.author_name == null ? null : String(row.author_name),
    tags: Array.isArray(row.tags) ? row.tags.map((t) => String(t)) : [],
    content_json: asTipTapDoc(row.content_json),
    published_at: row.published_at == null ? null : String(row.published_at),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}
