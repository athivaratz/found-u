import { Node, mergeAttributes } from "@tiptap/core";

export type StepHeadingAttrs = {
  title: string;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    stepHeading: {
      insertStepHeading: (attrs?: Partial<StepHeadingAttrs>) => ReturnType;
    };
  }
}

export const StepHeading = Node.create({
  name: "stepHeading",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      title: {
        default: "ขั้นตอนใหม่",
        parseHTML: (element) =>
          element.getAttribute("data-title") || "ขั้นตอนใหม่",
        renderHTML: (attributes) => ({
          "data-title": attributes.title || "ขั้นตอนใหม่",
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="step-heading"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "step-heading",
        class: "blog-step-heading",
      }),
      ["span", { class: "blog-step-heading__label" }, "Step"],
      [
        "span",
        { class: "blog-step-heading__title" },
        HTMLAttributes["data-title"] || "ขั้นตอนใหม่",
      ],
    ];
  },

  addCommands() {
    return {
      insertStepHeading:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              title: attrs?.title || "ขั้นตอนใหม่",
            },
          }),
    };
  },
});
