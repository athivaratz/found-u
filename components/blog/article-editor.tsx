"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Image as ImageIcon,
  Code2,
  ListOrdered as StepIcon,
  Video,
  Undo2,
  Redo2,
} from "lucide-react";
import { useEffect } from "react";
import { createBlogEditorExtensions } from "@/lib/blog/extensions";
import { parseVideoEmbedInput } from "@/lib/blog/video-embed";
import { CODE_LANGUAGES, type TipTapDoc } from "@/lib/blog/types";
import { cn } from "@/lib/utils";

type ArticleEditorProps = {
  initialDoc: TipTapDoc;
  onChange: (doc: TipTapDoc) => void;
  onUploadImage: (file: File) => Promise<string | null>;
  className?: string;
};

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40",
        active && "bg-[#e8f8ef] text-[#06C755]"
      )}
    >
      {children}
    </button>
  );
}

function EditorToolbar({
  editor,
  onUploadImage,
}: {
  editor: Editor;
  onUploadImage: (file: File) => Promise<string | null>;
}) {
  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL", prev || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const insertImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/gif";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const url = await onUploadImage(file);
      if (url) {
        editor.chain().focus().setImage({ src: url }).run();
      }
    };
    input.click();
  };

  const insertCode = () => {
    editor
      .chain()
      .focus()
      .toggleCodeBlock({ language: "typescript" })
      .run();
  };

  const insertVideo = () => {
    const pasted = window.prompt(
      "วางลิงก์ YouTube, Bunny Stream embed หรือโค้ด iframe\nตัวอย่าง:\nhttps://youtu.be/…\nhttps://iframe.mediadelivery.net/embed/{libraryId}/{videoId}"
    );
    if (pasted === null || !pasted.trim()) return;
    const parsed = parseVideoEmbedInput(pasted);
    if (!parsed) {
      window.alert(
        "ไม่รองรับลิงก์นี้\nรองรับ: YouTube, Bunny.net embed (iframe.mediadelivery.net), หรือไฟล์ .mp4 / .m3u8"
      );
      return;
    }
    editor.chain().focus().insertVideoEmbed(parsed).run();
  };

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 backdrop-blur px-2 py-1.5">
      <ToolbarButton
        title="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Heading 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Heading 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Ordered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Quote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton title="Link" active={editor.isActive("link")} onClick={setLink}>
        <LinkIcon className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton title="Image" onClick={insertImage}>
        <ImageIcon className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Code block"
        active={editor.isActive("codeBlock")}
        onClick={insertCode}
      >
        <Code2 className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Video (YouTube / Bunny)"
        active={editor.isActive("videoEmbed")}
        onClick={insertVideo}
      >
        <Video className="w-4 h-4" />
      </ToolbarButton>
      {editor.isActive("codeBlock") ? (
        <select
          className="ml-1 rounded-md border border-gray-200 dark:border-gray-600 bg-transparent text-xs px-2 py-1"
          value={String(editor.getAttributes("codeBlock").language || "plaintext")}
          onChange={(e) =>
            editor
              .chain()
              .focus()
              .updateAttributes("codeBlock", { language: e.target.value })
              .run()
          }
        >
          {CODE_LANGUAGES.map((lang) => (
            <option key={lang.id} value={lang.id}>
              {lang.label}
            </option>
          ))}
        </select>
      ) : null}
      <ToolbarButton
        title="Step section"
        active={editor.isActive("stepHeading")}
        onClick={() => {
          const title = window.prompt("ชื่อขั้นตอน", "ขั้นตอนใหม่");
          if (title === null) return;
          editor.chain().focus().insertStepHeading({ title: title || "ขั้นตอนใหม่" }).run();
        }}
      >
        <StepIcon className="w-4 h-4" />
      </ToolbarButton>
      <div className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-600" />
      <ToolbarButton
        title="Undo"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      >
        <Undo2 className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Redo"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      >
        <Redo2 className="w-4 h-4" />
      </ToolbarButton>
    </div>
  );
}

export function ArticleEditor({
  initialDoc,
  onChange,
  onUploadImage,
  className,
}: ArticleEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: createBlogEditorExtensions(),
    content: initialDoc,
    editorProps: {
      attributes: {
        class:
          "prose-blog min-h-[320px] px-4 py-4 focus:outline-none text-gray-900 dark:text-gray-100",
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getJSON() as TipTapDoc);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(initialDoc);
    if (current !== next) {
      editor.commands.setContent(initialDoc);
    }
    // Only sync when initialDoc identity changes from parent load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, initialDoc]);

  if (!editor) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center text-sm text-gray-500">
        กำลังโหลดตัวแก้ไข…
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden",
        className
      )}
    >
      <EditorToolbar editor={editor} onUploadImage={onUploadImage} />
      <EditorContent editor={editor} />
      <style jsx global>{`
        .prose-blog p {
          margin: 0.75rem 0;
          line-height: 1.7;
        }
        .prose-blog h2 {
          font-size: 1.35rem;
          font-weight: 600;
          margin: 1.25rem 0 0.5rem;
        }
        .prose-blog h3 {
          font-size: 1.15rem;
          font-weight: 600;
          margin: 1rem 0 0.4rem;
        }
        .prose-blog ul {
          list-style: disc;
          padding-left: 1.25rem;
          margin: 0.75rem 0;
        }
        .prose-blog ol {
          list-style: decimal;
          padding-left: 1.25rem;
          margin: 0.75rem 0;
        }
        .prose-blog blockquote {
          border-left: 3px solid #06c755;
          padding-left: 1rem;
          margin: 0.75rem 0;
          opacity: 0.85;
          font-style: italic;
        }
        .prose-blog pre {
          background: #0d1117;
          color: #e6edf3;
          border-radius: 0.75rem;
          padding: 1rem;
          overflow-x: auto;
          font-family: ui-monospace, monospace;
          font-size: 0.875rem;
          margin: 0.75rem 0;
        }
        .prose-blog img {
          max-width: 100%;
          height: auto;
          border-radius: 0.75rem;
          margin: 0.75rem 0;
        }
        .prose-blog .blog-step-heading {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          border: 1px solid #e5e7eb;
          border-radius: 1rem;
          padding: 0.75rem 1rem;
          margin: 0.75rem 0;
          background: #f9fafb;
        }
        .dark .prose-blog .blog-step-heading {
          border-color: #374151;
          background: #111827;
        }
        .prose-blog .blog-step-heading__label {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #e8f8ef;
          color: #06c755;
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          border-radius: 999px;
          padding: 0.25rem 0.6rem;
        }
        .prose-blog .blog-step-heading__title {
          font-weight: 600;
        }
        .prose-blog .blog-video-embed {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          border: 1px dashed #06c755;
          border-radius: 1rem;
          padding: 0.85rem 1rem;
          margin: 0.75rem 0;
          background: #e8f8ef;
        }
        .dark .prose-blog .blog-video-embed {
          background: rgba(6, 199, 85, 0.08);
          border-color: rgba(6, 199, 85, 0.45);
        }
        .prose-blog .blog-video-embed__badge {
          display: inline-flex;
          width: fit-content;
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #06c755;
        }
        .prose-blog .blog-video-embed__title {
          font-size: 0.875rem;
          font-weight: 500;
          opacity: 0.85;
        }
        .prose-blog p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #9ca3af;
          pointer-events: none;
          height: 0;
        }
      `}</style>
    </div>
  );
}
