"use client";

import { useState } from "react";
import { History, Pin, PinOff, Search, Trash2, X } from "lucide-react";
import { useChatContext } from "@/contexts/chat-context";
import { ChatSessionMenu } from "@/components/agent/chat-session-menu";
import { cn } from "@/lib/utils";

function formatSessionTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

type ChatSidebarProps = {
  className?: string;
  variant?: "drawer" | "inline";
};

export function ChatSidebar({ className, variant = "drawer" }: ChatSidebarProps) {
  const {
    sessions,
    activeSessionId,
    sidebarOpen,
    setSidebarOpen,
    switchSession,
    deleteSession,
    renameSession,
    pinSession,
    clearAgentMemory,
  } = useChatContext();
  const [query, setQuery] = useState("");

  const filtered = sessions.filter((s) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      s.title.toLowerCase().includes(q) ||
      s.preview.toLowerCase().includes(q)
    );
  });

  const content = (
    <div className={cn("flex flex-col h-full min-h-0", className)}>
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border-light/60 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <History className="w-4 h-4 text-text-tertiary shrink-0" />
          <h2 className="text-sm font-semibold text-text-primary truncate">ประวัติแชท</h2>
        </div>
        {variant === "drawer" ? (
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg hover:bg-bg-tertiary text-text-secondary"
            aria-label="ปิด"
          >
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      <div className="px-3 py-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาแชท..."
            className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-bg-tertiary border border-border-light/60 focus:outline-none focus:ring-1 focus:ring-line-green/40"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2 min-h-0">
        {filtered.length === 0 ? (
          <p className="text-xs text-text-tertiary text-center py-8 px-2">ยังไม่มีประวัติแชท</p>
        ) : (
          <ul className="space-y-1">
            {filtered.map((session) => {
              const isActive = session.id === activeSessionId;
              return (
                <li key={session.id}>
                  <div
                    className={cn(
                      "group flex items-start gap-1 rounded-xl transition-colors",
                      isActive ? "bg-line-green/10" : "hover:bg-bg-tertiary"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => void switchSession(session.id)}
                      className="flex-1 text-left px-3 py-2.5 min-w-0"
                    >
                      <div className="flex items-center gap-1.5">
                        {session.pinned ? (
                          <Pin className="w-3 h-3 text-line-green shrink-0" />
                        ) : null}
                        <span className="text-xs font-medium text-text-primary truncate">
                          {session.title}
                        </span>
                      </div>
                      {session.preview ? (
                        <p className="text-[10px] text-text-tertiary truncate mt-0.5">
                          {session.preview}
                        </p>
                      ) : null}
                      <p className="text-[10px] text-text-tertiary mt-1">
                        {formatSessionTime(session.updatedAt)}
                        {session.messageCount > 0 ? ` · ${session.messageCount} ข้อความ` : ""}
                      </p>
                    </button>
                    <div className="flex items-center gap-0.5 pr-1 pt-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => void pinSession(session.id, !session.pinned)}
                        className="p-1.5 rounded-lg hover:bg-bg-secondary text-text-tertiary"
                        aria-label={session.pinned ? "เลิกปักหมุด" : "ปักหมุด"}
                      >
                        {session.pinned ? (
                          <PinOff className="w-3.5 h-3.5" />
                        ) : (
                          <Pin className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <ChatSessionMenu
                        sessionId={session.id}
                        title={session.title}
                        onRename={renameSession}
                        onDelete={deleteSession}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="px-3 py-3 border-t border-border-light/60 shrink-0">
        <button
          type="button"
          onClick={() => void clearAgentMemory()}
          className="w-full flex items-center justify-center gap-2 text-xs text-text-secondary hover:text-status-error py-2 rounded-xl hover:bg-status-error-light/50 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          ลบความจำ Agent
        </button>
      </div>
    </div>
  );

  if (variant === "inline") {
    return (
      <aside className="w-[260px] shrink-0 border-r border-border-light/60 bg-bg-primary/80 flex flex-col min-h-0 h-full rounded-l-2xl overflow-hidden">
        {content}
      </aside>
    );
  }

  if (!sidebarOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 md:hidden"
        onClick={() => setSidebarOpen(false)}
        aria-hidden
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[min(100vw-3rem,280px)] bg-bg-primary shadow-xl",
          "flex flex-col md:hidden animate-in slide-in-from-left duration-200"
        )}
      >
        {content}
      </aside>
    </>
  );
}
