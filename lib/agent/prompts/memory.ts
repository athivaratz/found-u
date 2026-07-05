import type { MemoryFact } from "@/lib/chat/types";

export function buildMemorySection(facts: MemoryFact[]): string | null {
  if (!facts.length) return null;

  const lines = facts.map((fact) => {
    const date = new Date(fact.createdAt).toLocaleDateString("th-TH", {
      day: "numeric",
      month: "short",
    });
    return `- [${date}] ${fact.content}`;
  });

  return `Recent user activity from this device (for context only — verify with tools before citing codes):
${lines.join("\n")}`;
}
