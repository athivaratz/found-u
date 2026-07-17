/**
 * One-shot: convert legacy help_pages/help_sections → articles (TipTap)
 * then delete the legacy rows so /help uses the new renderer.
 *
 * Usage: bun run scripts/convert-help-to-articles.ts
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { parseHelpBody } from "../lib/help/types";
import type { TipTapDoc, TipTapNode } from "../lib/blog/types";

const env = fs.readFileSync(".env.local", "utf8");
const get = (k: string) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m?.[1]?.trim().replace(/^["']|["']$/g, "");
};

const url = get("NEXT_PUBLIC_SUPABASE_URL");
const key = get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

function audienceLabel(audience: string): string {
  if (audience === "student") return "นักเรียน";
  if (audience === "admin") return "แอดมิน";
  return "";
}

function bodyToNodes(body: string): TipTapNode[] {
  const blocks = parseHelpBody(body);
  const nodes: TipTapNode[] = [];
  for (const block of blocks) {
    if (block.type === "list") {
      nodes.push({
        type: "bulletList",
        content: block.items.map((item) => ({
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: item }],
            },
          ],
        })),
      });
    } else {
      nodes.push({
        type: "paragraph",
        content: block.text ? [{ type: "text", text: block.text }] : [],
      });
    }
  }
  return nodes;
}

function sectionToNodes(section: {
  section_type: string;
  audience: string;
  title: string;
  body: string;
}): TipTapNode[] {
  const label = audienceLabel(section.audience);
  const title = label ? `${section.title} (${label})` : section.title;
  const nodes: TipTapNode[] = [];

  if (section.section_type === "faq") {
    nodes.push({
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: title }],
    });
  } else {
    nodes.push({
      type: "stepHeading",
      attrs: { title },
    });
  }

  nodes.push(...bodyToNodes(section.body));
  return nodes;
}

function buildDoc(options: {
  intro: string | null;
  sections: Array<{
    section_type: string;
    audience: string;
    title: string;
    body: string;
    sort_order: number;
  }>;
}): TipTapDoc {
  const content: TipTapNode[] = [];

  if (options.intro?.trim()) {
    content.push({
      type: "paragraph",
      content: [{ type: "text", text: options.intro.trim() }],
    });
  }

  const sorted = [...options.sections].sort(
    (a, b) => a.sort_order - b.sort_order
  );

  const steps = sorted.filter((s) => s.section_type !== "faq");
  const faqs = sorted.filter((s) => s.section_type === "faq");

  for (const section of steps) {
    content.push(...sectionToNodes(section));
  }

  if (faqs.length > 0) {
    content.push({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "คำถามที่พบบ่อย" }],
    });
    for (const section of faqs) {
      content.push(...sectionToNodes(section));
    }
  }

  return { type: "doc", content };
}

async function main() {
  const { data: pages, error: pagesError } = await admin
    .from("help_pages")
    .select("*")
    .order("slug");
  if (pagesError) throw pagesError;
  if (!pages?.length) {
    console.log("No legacy help_pages to convert.");
    return;
  }

  const { data: sections, error: sectionsError } = await admin
    .from("help_sections")
    .select("*")
    .order("sort_order");
  if (sectionsError) throw sectionsError;

  const now = new Date().toISOString();

  for (const page of pages) {
    const slug = String(page.slug);
    const pageSections = (sections ?? []).filter(
      (s) => String(s.page_slug) === slug
    );
    const content_json = buildDoc({
      intro: page.intro == null ? null : String(page.intro),
      sections: pageSections.map((s) => ({
        section_type: String(s.section_type),
        audience: String(s.audience),
        title: String(s.title),
        body: String(s.body),
        sort_order: Number(s.sort_order ?? 0),
      })),
    });

    const payload = {
      slug,
      section: "help" as const,
      status: "published" as const,
      title: String(page.title),
      excerpt: page.description == null ? null : String(page.description),
      cover_image_url: null,
      author_name: "Found-U",
      tags: ["help", "guide"],
      content_json,
      published_at: now,
      updated_at: now,
    };

    const { data: existing } = await admin
      .from("articles")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await admin
        .from("articles")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw error;
      console.log("updated article", slug, existing.id);
    } else {
      const { data, error } = await admin
        .from("articles")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      console.log("created article", slug, data.id);
    }
  }

  // Remove legacy so public + admin use the new articles only
  const { error: delError } = await admin
    .from("help_pages")
    .delete()
    .in(
      "slug",
      pages.map((p) => String(p.slug))
    );
  if (delError) throw delError;
  console.log("deleted legacy help_pages:", pages.map((p) => p.slug).join(", "));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
