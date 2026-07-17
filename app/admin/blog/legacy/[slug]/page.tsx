"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ExternalLink,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { useAppDialog } from "@/hooks/use-app-dialog";
import {
  type HelpAudience,
  type HelpSectionType,
} from "@/lib/help/types";
import { cn } from "@/lib/utils";

type SectionRow = {
  id: string;
  page_slug: string;
  section_type: HelpSectionType;
  audience: HelpAudience;
  title: string;
  body: string;
  image_url: string | null;
  sort_order: number;
};

type PageForm = {
  title: string;
  description: string;
  intro: string;
};

const emptySection = (): Omit<SectionRow, "id" | "page_slug" | "sort_order"> => ({
  section_type: "step",
  audience: "all",
  title: "",
  body: "",
  image_url: null,
});

export default function AdminHelpEditorPage() {
  const params = useParams();
  const slug = String(params.slug ?? "").trim() || null;
  const { user } = useAuth();
  const { showAlert, showConfirm, dialog } = useAppDialog();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [notFoundPage, setNotFoundPage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pageForm, setPageForm] = useState<PageForm>({
    title: "",
    description: "",
    intro: "",
  });
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptySection());
  const [showAdd, setShowAdd] = useState(false);
  const [newForm, setNewForm] = useState(emptySection());
  const [uploading, setUploading] = useState(false);

  const publicPath = slug ? `/help/${slug}` : "/help";

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setNotFoundPage(false);
    try {
      const [{ data: page, error: pageError }, { data: sectionRows, error: sectionError }] =
        await Promise.all([
          supabase.from("help_pages").select("*").eq("slug", slug).maybeSingle(),
          supabase
            .from("help_sections")
            .select("*")
            .eq("page_slug", slug)
            .order("sort_order", { ascending: true }),
        ]);

      if (pageError) throw pageError;
      if (sectionError) throw sectionError;

      if (!page) {
        setNotFoundPage(true);
        setSections([]);
        return;
      }

      setPageForm({
        title: String(page.title ?? ""),
        description: String(page.description ?? ""),
        intro: String(page.intro ?? ""),
      });

      setSections(
        (sectionRows ?? []).map((row) => ({
          id: String(row.id),
          page_slug: String(row.page_slug),
          section_type: (row.section_type as HelpSectionType) || "step",
          audience: (row.audience as HelpAudience) || "all",
          title: String(row.title ?? ""),
          body: String(row.body ?? ""),
          image_url: row.image_url == null ? null : String(row.image_url),
          sort_order: Number(row.sort_order ?? 0),
        }))
      );
    } catch (error) {
      console.error(error);
      await showAlert({
        title: "โหลดไม่สำเร็จ",
        message: "ไม่สามารถโหลดเนื้อหาคู่มือได้",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [showAlert, slug, supabase]);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      setNotFoundPage(true);
      return;
    }
    void load();
  }, [load, slug]);

  const getToken = useCallback(async () => {
    if (!user) throw new Error("Not authenticated");
    return user.getIdToken();
  }, [user]);

  const uploadImage = async (file: File): Promise<string | null> => {
    if (!slug) return null;
    setUploading(true);
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.set("file", file);
      formData.set("slug", slug);
      const res = await fetch("/api/admin/help/upload", {
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

  const savePageMeta = async () => {
    if (!slug) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("help_pages")
        .update({
          title: pageForm.title.trim(),
          description: pageForm.description.trim() || null,
          intro: pageForm.intro.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("slug", slug);
      if (error) throw error;
      await showAlert({
        title: "บันทึกแล้ว",
        message: "อัปเดตหัวข้อและคำแนะนำหน้าแล้ว",
        variant: "success",
      });
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

  const startEdit = (section: SectionRow) => {
    setEditingId(section.id);
    setEditForm({
      section_type: section.section_type,
      audience: section.audience,
      title: section.title,
      body: section.body,
      image_url: section.image_url,
    });
    setShowAdd(false);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("help_sections")
        .update({
          section_type: editForm.section_type,
          audience: editForm.audience,
          title: editForm.title.trim(),
          body: editForm.body.trim(),
          image_url: editForm.image_url,
        })
        .eq("id", editingId);
      if (error) throw error;
      setEditingId(null);
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

  const addSection = async () => {
    if (!slug || !newForm.title.trim() || !newForm.body.trim()) {
      await showAlert({
        title: "ข้อมูลไม่ครบ",
        message: "กรุณากรอกชื่อและเนื้อหา",
        variant: "warning",
      });
      return;
    }
    setSaving(true);
    try {
      const nextOrder =
        sections.reduce((max, s) => Math.max(max, s.sort_order), 0) + 10;
      const { error } = await supabase.from("help_sections").insert({
        page_slug: slug,
        section_type: newForm.section_type,
        audience: newForm.audience,
        title: newForm.title.trim(),
        body: newForm.body.trim(),
        image_url: newForm.image_url,
        sort_order: nextOrder,
      });
      if (error) throw error;
      setShowAdd(false);
      setNewForm(emptySection());
      await load();
    } catch (error) {
      await showAlert({
        title: "เพิ่มไม่สำเร็จ",
        message: error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteSection = async (id: string) => {
    const ok = await showConfirm({
      title: "ลบหัวข้อนี้?",
      message: "การลบไม่สามารถย้อนกลับได้",
      confirmLabel: "ลบ",
      cancelLabel: "ยกเลิก",
      variant: "warning",
    });
    if (!ok) return;
    const { error } = await supabase.from("help_sections").delete().eq("id", id);
    if (error) {
      await showAlert({ title: "ลบไม่สำเร็จ", message: error.message, variant: "error" });
      return;
    }
    await load();
  };

  const moveSection = async (id: string, direction: "up" | "down") => {
    const index = sections.findIndex((s) => s.id === id);
    if (index < 0) return;
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= sections.length) return;

    const a = sections[index];
    const b = sections[swapIndex];
    const { error: e1 } = await supabase
      .from("help_sections")
      .update({ sort_order: b.sort_order })
      .eq("id", a.id);
    const { error: e2 } = await supabase
      .from("help_sections")
      .update({ sort_order: a.sort_order })
      .eq("id", b.id);
    if (e1 || e2) {
      await showAlert({
        title: "เรียงลำดับไม่สำเร็จ",
        message: e1?.message || e2?.message || "เกิดข้อผิดพลาด",
        variant: "error",
      });
      return;
    }
    await load();
  };

  if (!slug || notFoundPage) {
    return (
      <div className="p-8">
        <p className="text-red-500">ไม่พบหน้าคู่มือนี้</p>
        <Link href="/admin/blog?section=help" className="text-[#06C755] underline mt-2 inline-block">
          กลับรายการ
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#06C755]" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin/blog?section=help"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            บทความและคู่มือ
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            แก้ไขคู่มือเดิม: {pageForm.title || slug}
          </h1>
        </div>
        <Link
          href={publicPath}
          target="_blank"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-700 text-sm"
        >
          เปิดหน้าสาธารณะ
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>

      <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-white">ข้อมูลหน้า</h2>
        <label className="block space-y-1">
          <span className="text-sm text-gray-500">ชื่อหน้า</span>
          <input
            value={pageForm.title}
            onChange={(e) => setPageForm((p) => ({ ...p, title: e.target.value }))}
            className="w-full rounded-xl bg-gray-100 dark:bg-gray-900 px-4 py-3"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-gray-500">คำอธิบาย (meta)</span>
          <input
            value={pageForm.description}
            onChange={(e) =>
              setPageForm((p) => ({ ...p, description: e.target.value }))
            }
            className="w-full rounded-xl bg-gray-100 dark:bg-gray-900 px-4 py-3"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-gray-500">คำแนะนำด้านบน</span>
          <textarea
            value={pageForm.intro}
            onChange={(e) => setPageForm((p) => ({ ...p, intro: e.target.value }))}
            rows={3}
            className="w-full rounded-xl bg-gray-100 dark:bg-gray-900 px-4 py-3"
          />
        </label>
        <button
          type="button"
          onClick={() => void savePageMeta()}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#06C755] text-white font-medium disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          บันทึกข้อมูลหน้า
        </button>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-gray-900 dark:text-white">หัวข้อในหน้า</h2>
          <button
            type="button"
            onClick={() => {
              setShowAdd(true);
              setEditingId(null);
              setNewForm(emptySection());
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-700 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            เพิ่มหัวข้อ
          </button>
        </div>

        {showAdd && (
          <SectionForm
            form={newForm}
            setForm={setNewForm}
            uploading={uploading}
            onUpload={async (file) => {
              const url = await uploadImage(file);
              if (url) setNewForm((f) => ({ ...f, image_url: url }));
            }}
            onSave={() => void addSection()}
            onCancel={() => setShowAdd(false)}
            saving={saving}
            submitLabel="เพิ่ม"
          />
        )}

        <div className="space-y-3">
          {sections.map((section, index) => (
            <div
              key={section.id}
              className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4"
            >
              {editingId === section.id ? (
                <SectionForm
                  form={editForm}
                  setForm={setEditForm}
                  uploading={uploading}
                  onUpload={async (file) => {
                    const url = await uploadImage(file);
                    if (url) setEditForm((f) => ({ ...f, image_url: url }));
                  }}
                  onSave={() => void saveEdit()}
                  onCancel={() => setEditingId(null)}
                  saving={saving}
                  submitLabel="บันทึก"
                />
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-2 text-[11px] mb-1">
                        <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700">
                          {section.section_type}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700">
                          {section.audience}
                        </span>
                      </div>
                      <h3 className="font-medium text-gray-900 dark:text-white">
                        {section.title}
                      </h3>
                      <p className="mt-1 text-sm text-gray-500 line-clamp-2 whitespace-pre-wrap">
                        {section.body}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => void moveSection(section.id, "up")}
                        disabled={index === 0}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
                        aria-label="เลื่อนขึ้น"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void moveSection(section.id, "down")}
                        disabled={index === sections.length - 1}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
                        aria-label="เลื่อนลง"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(section)}
                      className="px-3 py-1.5 rounded-full text-sm bg-[#e8f8ef] text-[#06C755]"
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteSection(section.id)}
                      className="px-3 py-1.5 rounded-full text-sm bg-red-50 text-red-600 dark:bg-red-900/20"
                    >
                      <span className="inline-flex items-center gap-1">
                        <Trash2 className="w-3.5 h-3.5" />
                        ลบ
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
      {dialog}
    </div>
  );
}

type SectionFormProps = {
  form: ReturnType<typeof emptySection>;
  setForm: React.Dispatch<React.SetStateAction<ReturnType<typeof emptySection>>>;
  onSave: () => void;
  onCancel: () => void;
  onUpload: (file: File) => Promise<void>;
  uploading: boolean;
  saving: boolean;
  submitLabel: string;
};

function SectionForm({
  form,
  setForm,
  onSave,
  onCancel,
  onUpload,
  uploading,
  saving,
  submitLabel,
}: SectionFormProps) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm text-gray-500">ประเภท</span>
          <select
            value={form.section_type}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                section_type: e.target.value as HelpSectionType,
              }))
            }
            className="w-full rounded-xl bg-gray-100 dark:bg-gray-900 px-4 py-3"
          >
            <option value="step">step</option>
            <option value="note">note</option>
            <option value="faq">faq</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-gray-500">กลุ่มผู้ใช้</span>
          <select
            value={form.audience}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                audience: e.target.value as HelpAudience,
              }))
            }
            className="w-full rounded-xl bg-gray-100 dark:bg-gray-900 px-4 py-3"
          >
            <option value="all">all</option>
            <option value="student">student</option>
            <option value="admin">admin</option>
          </select>
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-sm text-gray-500">หัวข้อ</span>
        <input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          className="w-full rounded-xl bg-gray-100 dark:bg-gray-900 px-4 py-3"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-gray-500">
          เนื้อหา (ขึ้นบรรทัดใหม่สองครั้ง = ย่อหน้าใหม่, ขึ้นต้นด้วย &quot;- &quot; = รายการ)
        </span>
        <textarea
          value={form.body}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          rows={6}
          className="w-full rounded-xl bg-gray-100 dark:bg-gray-900 px-4 py-3 font-mono text-sm"
        />
      </label>
      <div className="space-y-2">
        <span className="text-sm text-gray-500">รูปประกอบ (ไม่บังคับ)</span>
        {form.image_url ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={form.image_url}
              alt=""
              className="max-h-40 rounded-xl border border-gray-200 dark:border-gray-700 object-contain"
            />
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, image_url: null }))}
              className="text-sm text-red-500"
            >
              ลบรูป
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
          {uploading ? "กำลังอัปโหลด..." : "อัปโหลดรูป"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onUpload(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#06C755] text-white text-sm font-medium disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-700 text-sm"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
