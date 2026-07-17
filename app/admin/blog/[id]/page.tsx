"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  Eye,
  Loader2,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { ArticleEditor } from "@/components/blog/article-editor";
import { mapArticle } from "@/lib/blog/map";
import {
  EMPTY_DOC,
  slugifyTitle,
  type Article,
  type ArticleSection,
  type ArticleStatus,
  type TipTapDoc,
} from "@/lib/blog/types";
import { cn } from "@/lib/utils";

export default function AdminBlogEditorPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const router = useRouter();
  const { user } = useAuth();
  const { showAlert, showConfirm, dialog } = useAppDialog();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [article, setArticle] = useState<Article | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [authorName, setAuthorName] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [section, setSection] = useState<ArticleSection>("blog");
  const [status, setStatus] = useState<ArticleStatus>("draft");
  const [contentJson, setContentJson] = useState<TipTapDoc>(EMPTY_DOC);
  const [editorKey, setEditorKey] = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("articles")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setArticle(null);
        return;
      }
      const mapped = mapArticle(data as Record<string, unknown>);
      setArticle(mapped);
      setTitle(mapped.title);
      setSlug(mapped.slug);
      setExcerpt(mapped.excerpt ?? "");
      setCoverImageUrl(mapped.cover_image_url);
      setAuthorName(mapped.author_name ?? "");
      setTagsInput(mapped.tags.join(", "));
      setSection(mapped.section);
      setStatus(mapped.status);
      setContentJson(mapped.content_json);
      setEditorKey((k) => k + 1);
    } catch (error) {
      console.error(error);
      await showAlert({
        title: "โหลดไม่สำเร็จ",
        message: "ไม่พบบทความนี้",
        variant: "error",
      });
      setArticle(null);
    } finally {
      setLoading(false);
    }
  }, [id, showAlert, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const getToken = useCallback(async () => {
    if (!user) throw new Error("Not authenticated");
    return user.getIdToken();
  }, [user]);

  const uploadImage = async (file: File): Promise<string | null> => {
    setUploading(true);
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.set("file", file);
      formData.set("folder", id || "general");
      const res = await fetch("/api/admin/blog/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "อัปโหลดไม่สำเร็จ");
      return String(data.publicUrl);
    } catch (error) {
      await showAlert({
        title: "อัปโหลดไม่สำเร็จ",
        message: error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
        variant: "error",
      });
      return null;
    } finally {
      setUploading(false);
    }
  };

  const parseTags = (value: string) =>
    value
      .split(/[,#]+/)
      .map((t) => t.trim())
      .filter(Boolean);

  const save = async (nextStatus?: ArticleStatus) => {
    if (!id) return;
    setSaving(true);
    try {
      const resolvedStatus = nextStatus ?? status;
      const payload = {
        title: title.trim() || "ไม่มีชื่อ",
        slug: slug.trim() || slugifyTitle(title),
        excerpt: excerpt.trim() || null,
        cover_image_url: coverImageUrl,
        author_name: authorName.trim() || null,
        tags: parseTags(tagsInput),
        section,
        status: resolvedStatus,
        content_json: contentJson,
        published_at:
          resolvedStatus === "published"
            ? article?.published_at || new Date().toISOString()
            : null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("articles")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
      setStatus(resolvedStatus);
      setSlug(payload.slug);
      await showAlert({
        title: "บันทึกแล้ว",
        message:
          resolvedStatus === "published"
            ? `เผยแพร่ที่ ${
                section === "help" ? `/help/${payload.slug}` : `/blog/${payload.slug}`
              } แล้ว`
            : "บันทึกฉบับร่างแล้ว",
        variant: "success",
      });
      await load();
    } catch (error) {
      await showAlert({
        title: "บันทึกไม่สำเร็จ",
        message: error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const ok = await showConfirm({
      title: "ลบบทความนี้?",
      message: "การลบไม่สามารถย้อนกลับได้",
      confirmLabel: "ลบ",
      cancelLabel: "ยกเลิก",
      variant: "warning",
    });
    if (!ok) return;
    const { error } = await supabase.from("articles").delete().eq("id", id);
    if (error) {
      await showAlert({
        title: "ลบไม่สำเร็จ",
        message: error.message,
        variant: "error",
      });
      return;
    }
    router.push("/admin/blog");
  };

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#06C755]" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="p-8">
        <p className="text-red-500">ไม่พบบทความนี้</p>
        <Link href="/admin/blog" className="text-[#06C755] underline mt-2 inline-block">
          กลับรายการ
        </Link>
      </div>
    );
  }

  const publicPath =
    section === "help" ? `/help/${slug}` : `/blog/${slug}`;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin/blog"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            บทความ
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {section === "help" ? "แก้ไขคู่มือ" : "แก้ไขบทความ"}
          </h1>
          <p className="mt-1 text-sm text-gray-500 font-mono">{publicPath}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/blog/${id}/preview`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-700 text-sm"
          >
            <Eye className="w-4 h-4" />
            ตัวอย่าง
          </Link>
          {status === "published" ? (
            <Link
              href={publicPath}
              target="_blank"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-700 text-sm"
            >
              เปิดหน้าสาธารณะ
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          ) : null}
        </div>
      </div>

      <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white">
            เผยแพร่ที่ไหน?
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            เลือกปลายทางสาธารณะของเนื้อหานี้ — เปลี่ยนได้ทุกเมื่อก่อนหรือหลังเผยแพร่
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              {
                id: "blog" as const,
                title: "Blog",
                path: `/blog/${slug || "…"}`,
                description: "บทความสาธารณะในหน้า /blog",
              },
              {
                id: "help" as const,
                title: "Help",
                path: `/help/${slug || "…"}`,
                description: "คู่มือในศูนย์ช่วยเหลือ /help",
              },
            ] as const
          ).map((option) => {
            const selected = section === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setSection(option.id)}
                className={cn(
                  "text-left rounded-2xl border-2 p-4 transition-colors",
                  selected
                    ? "border-[#06C755] bg-[#e8f8ef] dark:bg-[#06C755]/10"
                    : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {option.title}
                  </span>
                  <span
                    className={cn(
                      "h-4 w-4 rounded-full border-2",
                      selected
                        ? "border-[#06C755] bg-[#06C755]"
                        : "border-gray-300 dark:border-gray-500"
                    )}
                    aria-hidden
                  />
                </div>
                <p className="mt-2 font-mono text-sm text-[#06C755]">{option.path}</p>
                <p className="mt-1 text-xs text-gray-500">{option.description}</p>
              </button>
            );
          })}
        </div>

        <p className="rounded-xl bg-gray-100 dark:bg-gray-900 px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
          URL สาธารณะ:{" "}
          <span className="font-mono font-medium text-gray-900 dark:text-white">
            {publicPath}
          </span>
          {status === "published" ? (
            <span className="text-[#06C755]"> · เผยแพร่แล้ว</span>
          ) : (
            <span className="text-amber-600"> · ยังเป็นฉบับร่าง</span>
          )}
        </p>
      </section>

      <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-white">ข้อมูลเนื้อหา</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-sm text-gray-500">ชื่อเรื่อง</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl bg-gray-100 dark:bg-gray-900 px-4 py-3"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-gray-500">Slug (ส่วนท้ายของ URL)</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full rounded-xl bg-gray-100 dark:bg-gray-900 px-4 py-3 font-mono text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-gray-500">ผู้เขียน</span>
            <input
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              className="w-full rounded-xl bg-gray-100 dark:bg-gray-900 px-4 py-3"
            />
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-sm text-gray-500">Excerpt / คำอธิบายสั้น</span>
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={2}
              className="w-full rounded-xl bg-gray-100 dark:bg-gray-900 px-4 py-3"
            />
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-sm text-gray-500">แท็ก (คั่นด้วยจุลภาค)</span>
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="setup, nfc, guide"
              className="w-full rounded-xl bg-gray-100 dark:bg-gray-900 px-4 py-3"
            />
          </label>
        </div>

        <div className="space-y-2">
          <span className="text-sm text-gray-500">รูปปก</span>
          {coverImageUrl ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverImageUrl}
                alt=""
                className="max-h-40 rounded-xl border border-gray-200 dark:border-gray-700 object-contain"
              />
              <button
                type="button"
                onClick={() => setCoverImageUrl(null)}
                className="text-sm text-red-500"
              >
                ลบรูปปก
              </button>
            </div>
          ) : null}
          <label
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-700 text-sm cursor-pointer",
              uploading && "opacity-50 pointer-events-none"
            )}
          >
            <Upload className="w-4 h-4" />
            {uploading ? "กำลังอัปโหลด..." : "อัปโหลดรูปปก"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void uploadImage(file).then((url) => {
                    if (url) setCoverImageUrl(url);
                  });
                }
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </section>

      <ArticleEditor
        key={editorKey}
        initialDoc={contentJson}
        onChange={setContentJson}
        onUploadImage={uploadImage}
      />

      <div className="flex flex-wrap gap-2 sticky bottom-4">
        <button
          type="button"
          onClick={() => void save("draft")}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gray-100 dark:bg-gray-700 text-sm font-medium disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          บันทึกฉบับร่าง
        </button>
        <button
          type="button"
          onClick={() => void save("published")}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#06C755] text-white text-sm font-medium disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          เผยแพร่
        </button>
        {status === "published" ? (
          <button
            type="button"
            onClick={() => void save("draft")}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 text-sm font-medium disabled:opacity-50"
          >
            ยกเลิกการเผยแพร่
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void remove()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-red-50 text-red-600 dark:bg-red-900/20 text-sm font-medium ml-auto"
        >
          <Trash2 className="w-4 h-4" />
          ลบ
        </button>
      </div>
      {dialog}
    </div>
  );
}
