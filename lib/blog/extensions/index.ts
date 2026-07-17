import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { BlogCodeBlock } from "@/lib/blog/extensions/blog-code-block";
import { StepHeading } from "@/lib/blog/extensions/step-heading";
import { VideoEmbed } from "@/lib/blog/extensions/video-embed";

export function createBlogEditorExtensions(placeholder =
  "เริ่มเขียนบทความ…") {
  return [
    StarterKit.configure({
      codeBlock: false,
      heading: { levels: [2, 3] },
    }),
    BlogCodeBlock,
    StepHeading,
    VideoEmbed,
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        class: "text-line-green-link underline",
      },
    }),
    Image.configure({
      HTMLAttributes: {
        class: "rounded-xl border border-border-light max-w-full h-auto",
      },
    }),
    Placeholder.configure({ placeholder }),
  ];
}
