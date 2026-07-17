import { ImageResponse } from "next/og";
import { getPublishedArticleBySlug } from "@/lib/blog/data";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function BlogOgImage({ params }: Props) {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug, "blog");

  const title = article?.title ?? "Found-U Blog";
  const excerpt = article?.excerpt ?? "ระบบแจ้งของหาย-ของเจอสำหรับโรงเรียน";
  const tags = article?.tags?.slice(0, 3) ?? [];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: "linear-gradient(145deg, #0f172a 0%, #064e3b 55%, #06C755 140%)",
          color: "#fff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "#06C755",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            F
          </div>
          <span style={{ fontSize: 28, fontWeight: 600, opacity: 0.9 }}>
            Found-U
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: title.length > 60 ? 44 : 56,
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: "-0.02em",
              maxWidth: 1000,
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 26,
              opacity: 0.85,
              lineHeight: 1.4,
              maxWidth: 900,
            }}
          >
            {excerpt.length > 140 ? `${excerpt.slice(0, 137)}…` : excerpt}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {tags.map((tag) => (
            <div
              key={tag}
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.15)",
                fontSize: 20,
              }}
            >
              #{tag}
            </div>
          ))}
          {article?.author_name ? (
            <div style={{ marginLeft: "auto", fontSize: 22, opacity: 0.8 }}>
              {article.author_name}
            </div>
          ) : null}
        </div>
      </div>
    ),
    { ...size }
  );
}
