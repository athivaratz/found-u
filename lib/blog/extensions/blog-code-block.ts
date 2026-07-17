import CodeBlock from "@tiptap/extension-code-block";

/**
 * Extends TipTap's built-in codeBlock with a `language` attribute.
 * Syntax highlighting is applied only at public render time via Shiki.
 */
export const BlogCodeBlock = CodeBlock.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      language: {
        default: "plaintext",
        parseHTML: (element) => {
          const lang =
            element.getAttribute("data-language") ||
            element.getAttribute("class")?.match(/language-(\w+)/)?.[1];
          return lang || "plaintext";
        },
        renderHTML: (attributes) => ({
          "data-language": attributes.language || "plaintext",
          class: `language-${attributes.language || "plaintext"}`,
        }),
      },
    };
  },
});
