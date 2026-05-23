"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { Radio, Search, Loader2, Ban } from "lucide-react";
import { getAllNfcTags, updateNfcTag } from "@/lib/firestore";
import { NFC_TAG_STATUS_CONFIG, CATEGORIES, type NfcTag } from "@/lib/types";
import { cn, formatThaiDate } from "@/lib/utils";

export default function AdminNfcPage() {
  const [tags, setTags] = useState<NfcTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    getAllNfcTags(500)
      .then(setTags)
      .finally(() => setLoading(false));
  }, []);

  const filtered = tags.filter(
    (t) =>
      t.id.includes(search.toUpperCase()) ||
      t.itemName.toLowerCase().includes(search.toLowerCase()) ||
      t.tagUid?.includes(search) ||
      t.ownerId.includes(search)
  );

  const handleDisable = async (tag: NfcTag) => {
    if (!confirm(`ปิดใช้งาน Tag ${tag.id}?`)) return;
    await updateNfcTag(tag.id, { status: "disabled" });
    setTags((prev) =>
      prev.map((t) => (t.id === tag.id ? { ...t, status: "disabled" } : t))
    );
  };

  const stats = {
    total: tags.length,
    lost: tags.filter((t) => t.status === "lost").length,
    active: tags.filter((t) => t.status === "active").length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Radio className="w-7 h-7 text-[#06C755]" /> NFC Tags
        </h1>
        <p className="text-gray-500 mt-1">จัดการแท็ก NFC ทั้งหมดในระบบ</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "ทั้งหมด", value: stats.total, color: "text-gray-900 dark:text-white" },
          { label: "ใช้งานปกติ", value: stats.active, color: "text-[#06C755]" },
          { label: "แจ้งของหาย", value: stats.lost, color: "text-amber-600" },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700"
          >
            <p className="text-sm text-gray-500">{s.label}</p>
            <p className={cn("text-2xl font-bold mt-1", s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหา Tag ID, ชื่อ, UID, Owner..."
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[#06C755]" />
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="text-left p-3 font-medium">Tag ID</th>
                  <th className="text-left p-3 font-medium">สิ่งของ</th>
                  <th className="text-left p-3 font-medium">สถานะ</th>
                  <th className="text-left p-3 font-medium">Owner</th>
                  <th className="text-left p-3 font-medium">ลงทะเบียน</th>
                  <th className="text-left p-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tag) => {
                  const status = NFC_TAG_STATUS_CONFIG[tag.status];
                  const cat = CATEGORIES.find((c) => c.value === tag.category);
                  return (
                    <tr
                      key={tag.id}
                      className="border-t border-gray-100 dark:border-gray-700"
                    >
                      <td className="p-3 font-mono text-xs">{tag.id}</td>
                      <td className="p-3">
                        {cat?.icon} {tag.itemName}
                      </td>
                      <td className="p-3">
                        <span
                          className={cn(
                            "text-xs px-2 py-1 rounded-full",
                            status.bgColor,
                            status.color
                          )}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-xs truncate max-w-[120px]">
                        {tag.ownerId}
                      </td>
                      <td className="p-3 text-gray-500">{formatThaiDate(tag.registeredAt)}</td>
                      <td className="p-3">
                        {tag.status !== "disabled" && (
                          <button
                            type="button"
                            onClick={() => handleDisable(tag)}
                            className="text-red-500 hover:text-red-600 flex items-center gap-1"
                          >
                            <Ban className="w-4 h-4" /> ปิด
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <p className="text-center text-gray-500 py-8">ไม่พบแท็ก</p>
          )}
        </div>
      )}
    </div>
  );
}
