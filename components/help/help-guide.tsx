"use client";

import { useMemo, useState } from "react";
import { GuideSection } from "@/components/help/guide-section";
import { GuideFaq } from "@/components/help/guide-faq";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import type { HelpSection } from "@/lib/help/types";

type HelpGuideProps = {
  intro: string | null;
  sections: HelpSection[];
};

export function HelpGuide({ intro, sections }: HelpGuideProps) {
  const hasAudienceSplit = useMemo(
    () =>
      sections.some(
        (section) => section.audience === "student" || section.audience === "admin"
      ),
    [sections]
  );

  const [audience, setAudience] = useState<"student" | "admin">("student");

  const visible = useMemo(() => {
    if (!hasAudienceSplit) return sections;
    return sections.filter(
      (section) => section.audience === "all" || section.audience === audience
    );
  }, [audience, hasAudienceSplit, sections]);

  const steps = visible.filter(
    (s) => s.section_type === "step" || s.section_type === "note"
  );
  const faqs = visible.filter((s) => s.section_type === "faq");

  return (
    <div className="space-y-6">
      {intro ? (
        <p className="max-w-[65ch] text-pretty text-base leading-relaxed text-text-secondary">
          {intro}
        </p>
      ) : null}

      {hasAudienceSplit ? (
        <SegmentedTabs
          items={[
            { id: "student", label: "นักเรียน" },
            { id: "admin", label: "แอดมิน" },
          ]}
          value={audience}
          onChange={(id) => setAudience(id)}
          className="max-w-md"
        />
      ) : null}

      <div className="space-y-4">
        {steps.map((section, index) => (
          <GuideSection
            key={section.id}
            title={section.title}
            body={section.body}
            imageUrl={section.image_url}
            stepNumber={section.section_type === "step" ? index + 1 : undefined}
          />
        ))}
      </div>

      <GuideFaq sections={faqs} />
    </div>
  );
}
