"use client";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { EditorContent, ReactRenderer, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Mention from "@tiptap/extension-mention";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import {
  Bold,
  Code,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import type { UserBrief } from "@/types";

export type MentionSource = (query: string) => Promise<UserBrief[]>;

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minimal?: boolean;
  mentionSource?: MentionSource;
  className?: string;
  editorClassName?: string;
  onSubmitShortcut?: () => void;
  invalid?: boolean;
  disabled?: boolean;
}

interface MentionListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const MentionList = forwardRef<MentionListHandle, SuggestionProps<UserBrief>>((props, ref) => {
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [props.items]);
  const select = (i: number) => {
    const item = props.items[i];
    if (item) props.command({ id: item.id, label: item.full_name });
  };
  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowDown") {
        setIndex((i) => (i + 1) % Math.max(props.items.length, 1));
        return true;
      }
      if (event.key === "ArrowUp") {
        setIndex((i) => (i - 1 + props.items.length) % Math.max(props.items.length, 1));
        return true;
      }
      if (event.key === "Enter") {
        select(index);
        return true;
      }
      return false;
    },
  }));
  return (
    <div className="w-60 rounded-xl border bg-card p-1 shadow-pop" dir="rtl">
      {props.items.length === 0 ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">کاربری یافت نشد</p>
      ) : (
        props.items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            onClick={() => select(i)}
            className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm", i === index ? "bg-primary/10 text-primary" : "hover:bg-muted")}
          >
            <Avatar name={item.full_name} src={item.avatar_url} size="xs" />
            {item.full_name}
          </button>
        ))
      )}
    </div>
  );
});
MentionList.displayName = "MentionList";

function mentionSuggestion(source: MentionSource) {
  return {
    items: async ({ query }: { query: string }) => {
      try {
        return (await source(query)).slice(0, 8);
      } catch {
        return [];
      }
    },
    render: () => {
      let renderer: ReactRenderer<MentionListHandle, SuggestionProps<UserBrief>> | null = null;
      let container: HTMLDivElement | null = null;
      const place = (props: SuggestionProps<UserBrief>) => {
        const rect = props.clientRect?.();
        if (!rect || !container) return;
        container.style.top = `${rect.bottom + window.scrollY + 6}px`;
        container.style.left = `${Math.max(8, rect.right + window.scrollX - 240)}px`;
      };
      return {
        onStart: (props: SuggestionProps<UserBrief>) => {
          renderer = new ReactRenderer(MentionList, { props, editor: props.editor });
          container = document.createElement("div");
          container.style.position = "absolute";
          container.style.zIndex = "60";
          container.appendChild(renderer.element);
          document.body.appendChild(container);
          place(props);
        },
        onUpdate: (props: SuggestionProps<UserBrief>) => {
          renderer?.updateProps(props);
          place(props);
        },
        onKeyDown: (props: SuggestionKeyDownProps) => {
          if (props.event.key === "Escape") {
            container?.remove();
            return true;
          }
          return renderer?.ref?.onKeyDown(props) ?? false;
        },
        onExit: () => {
          container?.remove();
          renderer?.destroy();
          container = null;
          renderer = null;
        },
      };
    },
  };
}

function ToolbarButton({ onClick, active, label, children }: { onClick: () => void; active?: boolean; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn("flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground", active && "bg-muted text-foreground")}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, minimal }: { editor: Editor; minimal?: boolean }) {
  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("آدرس لینک را وارد کنید", previous ?? "https://");
    if (url === null) return;
    if (url === "" || url === "https://") editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };
  const c = () => editor.chain().focus();
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
      <ToolbarButton label="پررنگ" active={editor.isActive("bold")} onClick={() => c().toggleBold().run()}><Bold className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton label="کج" active={editor.isActive("italic")} onClick={() => c().toggleItalic().run()}><Italic className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton label="زیرخط" active={editor.isActive("underline")} onClick={() => c().toggleUnderline().run()}><UnderlineIcon className="h-4 w-4" /></ToolbarButton>
      {!minimal && <ToolbarButton label="خط‌خورده" active={editor.isActive("strike")} onClick={() => c().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></ToolbarButton>}
      <span className="mx-1 h-5 w-px bg-border" />
      {!minimal && <ToolbarButton label="عنوان" active={editor.isActive("heading", { level: 2 })} onClick={() => c().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></ToolbarButton>}
      <ToolbarButton label="فهرست" active={editor.isActive("bulletList")} onClick={() => c().toggleBulletList().run()}><List className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton label="فهرست شماره‌دار" active={editor.isActive("orderedList")} onClick={() => c().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton label="نقل قول" active={editor.isActive("blockquote")} onClick={() => c().toggleBlockquote().run()}><Quote className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton label="کد" active={editor.isActive("code")} onClick={() => c().toggleCode().run()}><Code className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton label="لینک" active={editor.isActive("link")} onClick={setLink}><Link2 className="h-4 w-4" /></ToolbarButton>
      {!minimal && (
        <>
          <span className="mx-1 h-5 w-px bg-border" />
          <ToolbarButton label="بازگشت" onClick={() => c().undo().run()}><Undo2 className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton label="انجام مجدد" onClick={() => c().redo().run()}><Redo2 className="h-4 w-4" /></ToolbarButton>
        </>
      )}
    </div>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "متن خود را بنویسید...",
  minimal,
  mentionSource,
  className,
  editorClassName,
  onSubmitShortcut,
  invalid,
  disabled,
}: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } }),
      Placeholder.configure({ placeholder }),
      ...(mentionSource
        ? [
            Mention.configure({
              HTMLAttributes: { class: "mention" },
              renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
              renderHTML: ({ node, options }) => [
                "span",
                { ...options.HTMLAttributes, "data-type": "mention", "data-id": node.attrs.id, "data-label": node.attrs.label },
                `@${node.attrs.label ?? node.attrs.id}`,
              ],
              suggestion: mentionSuggestion(mentionSource),
            }),
          ]
        : []),
    ],
    content: value,
    editorProps: {
      attributes: { class: cn("prose-content px-3 py-2", editorClassName), dir: "rtl" },
      handleKeyDown: (_view, event) => {
        if (onSubmitShortcut && event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          onSubmitShortcut();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML() && !(value === "" && editor.isEmpty)) {
      editor.commands.setContent(value || "", false);
    }
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-input bg-card transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20",
        invalid && "border-danger",
        className,
      )}
    >
      {editor && <Toolbar editor={editor} minimal={minimal} />}
      <EditorContent editor={editor} />
    </div>
  );
}
