"use client";

import { useEffect } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import {
  BoldIcon,
  CodeIcon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  StrikethroughIcon,
  TextQuoteIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MarkdownEditorProps {
  value: string; // markdown
  onChange: (markdown: string) => void;
  placeholder?: string;
}

interface MarkdownStorage {
  markdown: { getMarkdown: () => string };
}

function getMarkdown(editor: Editor): string {
  return (editor.storage as unknown as MarkdownStorage).markdown.getMarkdown();
}

interface ToolbarItem {
  label: string;
  icon: typeof BoldIcon;
  isActive: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
}

const TOOLBAR_ITEMS: ToolbarItem[] = [
  {
    label: "굵게",
    icon: BoldIcon,
    isActive: (e) => e.isActive("bold"),
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    label: "기울임",
    icon: ItalicIcon,
    isActive: (e) => e.isActive("italic"),
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    label: "취소선",
    icon: StrikethroughIcon,
    isActive: (e) => e.isActive("strike"),
    run: (e) => e.chain().focus().toggleStrike().run(),
  },
  {
    label: "제목 2",
    icon: Heading2Icon,
    isActive: (e) => e.isActive("heading", { level: 2 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    label: "제목 3",
    icon: Heading3Icon,
    isActive: (e) => e.isActive("heading", { level: 3 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    label: "글머리 기호 목록",
    icon: ListIcon,
    isActive: (e) => e.isActive("bulletList"),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    label: "번호 매기기 목록",
    icon: ListOrderedIcon,
    isActive: (e) => e.isActive("orderedList"),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    label: "인용",
    icon: TextQuoteIcon,
    isActive: (e) => e.isActive("blockquote"),
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    label: "코드",
    icon: CodeIcon,
    isActive: (e) => e.isActive("code"),
    run: (e) => e.chain().focus().toggleCode().run(),
  },
];

export function MarkdownEditor({ value, onChange, placeholder }: MarkdownEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      Markdown.configure({ html: false, transformPastedText: true }),
    ],
    content: value,
    onUpdate: ({ editor: e }) => {
      onChange(getMarkdown(e));
    },
    editorProps: {
      attributes: {
        class: cn(
          "min-h-24 w-full px-3 py-2 text-sm outline-none",
          // Minimal prose styles
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
          "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-1.5",
          "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
          "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs",
          "[&_p]:my-0.5",
          // Placeholder styling (tiptap placeholder uses data-placeholder)
          "[&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]",
          "[&_p.is-editor-empty:first-child]:before:text-muted-foreground",
          "[&_p.is-editor-empty:first-child]:before:float-left",
          "[&_p.is-editor-empty:first-child]:before:pointer-events-none",
          "[&_p.is-editor-empty:first-child]:before:h-0"
        ),
      },
    },
  });

  // Sync external value changes (e.g. form reset) without looping on our own onChange
  useEffect(() => {
    if (!editor) return;
    if (getMarkdown(editor) !== value) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, value]);

  return (
    <div className="rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
      <div className="flex flex-wrap items-center gap-0.5 border-b px-1 py-1">
        {TOOLBAR_ITEMS.map((item) => (
          <Button
            key={item.label}
            type="button"
            variant="ghost"
            size="icon"
            aria-label={item.label}
            disabled={!editor}
            className={cn(
              "size-7",
              editor && item.isActive(editor) && "bg-accent text-accent-foreground"
            )}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor && item.run(editor)}
          >
            <item.icon className="size-3.5" />
          </Button>
        ))}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
