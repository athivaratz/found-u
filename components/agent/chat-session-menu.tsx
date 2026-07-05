"use client";

import { useState } from "react";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";

type ChatSessionMenuProps = {
  sessionId: string;
  title: string;
  onRename: (sessionId: string, title: string) => Promise<void>;
  onDelete: (sessionId: string) => Promise<void>;
};

export function ChatSessionMenu({
  sessionId,
  title,
  onRename,
  onDelete,
}: ChatSessionMenuProps) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(title);

  const handleRename = async () => {
    const next = draft.trim();
    if (next) {
      await onRename(sessionId, next);
    }
    setRenaming(false);
    setOpen(false);
  };

  const handleDelete = async () => {
    if (!confirm("ลบแชทนี้ถาวร?")) return;
    await onDelete(sessionId);
    setOpen(false);
  };

  if (renaming) {
    return (
      <div className="absolute right-2 top-2 z-10 bg-bg-primary border border-border-light rounded-xl p-2 shadow-lg w-48">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full text-xs px-2 py-1.5 rounded-lg border border-border-light mb-2"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleRename();
            if (e.key === "Escape") setRenaming(false);
          }}
        />
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => void handleRename()}
            className="flex-1 text-xs py-1 rounded-lg bg-line-green text-white"
          >
            บันทึก
          </button>
          <button
            type="button"
            onClick={() => setRenaming(false)}
            className="flex-1 text-xs py-1 rounded-lg bg-bg-tertiary"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-lg hover:bg-bg-secondary text-text-tertiary"
        aria-label="เมนูแชท"
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-full mt-1 z-20 bg-bg-primary border border-border-light rounded-xl shadow-lg py-1 min-w-[140px]">
            <button
              type="button"
              onClick={() => {
                setDraft(title);
                setRenaming(true);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-primary hover:bg-bg-tertiary"
            >
              <Pencil className="w-3.5 h-3.5" />
              เปลี่ยนชื่อ
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-status-error hover:bg-status-error-light/50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              ลบแชท
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
