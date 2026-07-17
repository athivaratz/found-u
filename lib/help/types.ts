export type HelpSectionType = "step" | "note" | "faq";
export type HelpAudience = "all" | "student" | "admin";

export type HelpPage = {
  slug: string;
  title: string;
  description: string | null;
  intro: string | null;
  updated_at: string;
};

export type HelpSection = {
  id: string;
  page_slug: string;
  section_type: HelpSectionType;
  audience: HelpAudience;
  title: string;
  body: string;
  image_url: string | null;
  sort_order: number;
  created_at: string;
};

export type HelpPageWithSections = HelpPage & {
  sections: HelpSection[];
};

export const HELP_SLUGS = ["how-to-use", "new-school"] as const;
export type HelpSlug = (typeof HELP_SLUGS)[number];

export function isHelpSlug(value: string): value is HelpSlug {
  return (HELP_SLUGS as readonly string[]).includes(value);
}

export function parseHelpBody(body: string): Array<
  { type: "paragraph"; text: string } | { type: "list"; items: string[] }
> {
  const blocks: Array<
    { type: "paragraph"; text: string } | { type: "list"; items: string[] }
  > = [];
  const paragraphs = body.replace(/\r\n/g, "\n").split(/\n\n+/);

  for (const paragraph of paragraphs) {
    const lines = paragraph
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    const bulletLines = lines.filter((line) => /^[-*•]\s+/.test(line));
    if (bulletLines.length === lines.length && bulletLines.length > 0) {
      blocks.push({
        type: "list",
        items: bulletLines.map((line) => line.replace(/^[-*•]\s+/, "")),
      });
      continue;
    }

    blocks.push({ type: "paragraph", text: lines.join(" ") });
  }

  return blocks;
}
