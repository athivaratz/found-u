import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HelpGuide } from "@/components/help/help-guide";
import { getHelpPageWithSections } from "@/lib/help/data";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getHelpPageWithSections(slug);
  if (!page) {
    return { title: "ไม่พบหน้าคู่มือ" };
  }
  return {
    title: page.title,
    description: page.description ?? undefined,
  };
}

export default async function HelpSlugPage({ params }: PageProps) {
  const { slug } = await params;
  const page = await getHelpPageWithSections(slug);

  if (!page) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-balance text-2xl font-semibold tracking-tight text-text-primary md:text-3xl">
          {page.title}
        </h1>
      </div>
      <HelpGuide intro={page.intro} sections={page.sections} />
    </div>
  );
}
