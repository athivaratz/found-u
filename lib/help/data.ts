import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminEnv } from "@/lib/setup/db-url";
import type {
  HelpAudience,
  HelpPage,
  HelpPageWithSections,
  HelpSection,
  HelpSectionType,
  HelpSlug,
} from "@/lib/help/types";

function asSectionType(value: unknown): HelpSectionType {
  if (value === "note" || value === "faq" || value === "step") return value;
  return "step";
}

function asAudience(value: unknown): HelpAudience {
  if (value === "student" || value === "admin" || value === "all") return value;
  return "all";
}

function mapPage(row: Record<string, unknown>): HelpPage {
  return {
    slug: String(row.slug ?? ""),
    title: String(row.title ?? ""),
    description: row.description == null ? null : String(row.description),
    intro: row.intro == null ? null : String(row.intro),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapSection(row: Record<string, unknown>): HelpSection {
  return {
    id: String(row.id ?? ""),
    page_slug: String(row.page_slug ?? ""),
    section_type: asSectionType(row.section_type),
    audience: asAudience(row.audience),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    image_url: row.image_url == null ? null : String(row.image_url),
    sort_order: Number(row.sort_order ?? 0),
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

export async function getHelpPageWithSections(
  slug: HelpSlug
): Promise<HelpPageWithSections | null> {
  if (!hasSupabaseAdminEnv()) return null;

  try {
    const admin = createAdminClient();
    const [{ data: pageRow, error: pageError }, { data: sectionRows, error: sectionError }] =
      await Promise.all([
        admin.from("help_pages").select("*").eq("slug", slug).maybeSingle(),
        admin
          .from("help_sections")
          .select("*")
          .eq("page_slug", slug)
          .order("sort_order", { ascending: true }),
      ]);

    if (pageError || sectionError || !pageRow) {
      if (pageError) console.error("[help] page fetch error:", pageError);
      if (sectionError) console.error("[help] sections fetch error:", sectionError);
      return null;
    }

    return {
      ...mapPage(pageRow as Record<string, unknown>),
      sections: (sectionRows ?? []).map((row) =>
        mapSection(row as Record<string, unknown>)
      ),
    };
  } catch (error) {
    console.error("[help] getHelpPageWithSections:", error);
    return null;
  }
}

export async function listHelpPages(): Promise<HelpPage[]> {
  if (!hasSupabaseAdminEnv()) return [];

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("help_pages")
      .select("*")
      .order("slug", { ascending: true });
    if (error) {
      console.error("[help] listHelpPages:", error);
      return [];
    }
    return (data ?? []).map((row) => mapPage(row as Record<string, unknown>));
  } catch (error) {
    console.error("[help] listHelpPages:", error);
    return [];
  }
}
