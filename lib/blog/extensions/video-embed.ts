import { Node, mergeAttributes } from "@tiptap/core";
import type { VideoProvider } from "@/lib/blog/video-embed";

export type VideoEmbedAttrs = {
  provider: VideoProvider;
  src: string;
  title: string;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    videoEmbed: {
      insertVideoEmbed: (attrs: VideoEmbedAttrs) => ReturnType;
    };
  }
}

export const VideoEmbed = Node.create({
  name: "videoEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      provider: {
        default: "youtube",
        parseHTML: (el) =>
          (el.getAttribute("data-provider") as VideoProvider) || "youtube",
        renderHTML: (attrs) => ({
          "data-provider": attrs.provider || "youtube",
        }),
      },
      src: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-src") || "",
        renderHTML: (attrs) => ({ "data-src": attrs.src || "" }),
      },
      title: {
        default: "Video",
        parseHTML: (el) => el.getAttribute("data-title") || "Video",
        renderHTML: (attrs) => ({ "data-title": attrs.title || "Video" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="video-embed"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const provider = String(HTMLAttributes["data-provider"] || "youtube");
    const title = String(HTMLAttributes["data-title"] || "Video");
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "video-embed",
        class: "blog-video-embed",
      }),
      [
        "div",
        { class: "blog-video-embed__badge" },
        provider === "bunny"
          ? "Bunny"
          : provider === "file"
            ? "Video.js"
            : "YouTube",
      ],
      ["div", { class: "blog-video-embed__title" }, title],
    ];
  },

  addCommands() {
    return {
      insertVideoEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              provider: attrs.provider,
              src: attrs.src,
              title: attrs.title || "Video",
            },
          }),
    };
  },
});
