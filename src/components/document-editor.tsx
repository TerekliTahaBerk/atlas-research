"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import { Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Mathematics from "@tiptap/extension-mathematics";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DocNode } from "@/lib/document-model";
import { safeHref } from "@/lib/document-model";
import type { CitationView } from "@/lib/collaboration-types";
import { Modal } from "./ui";
import "katex/dist/katex.min.css";
export function RichEditor({
  initial,
  editable,
  onChange,
  citations,
  insertRef,
}: {
  initial: DocNode;
  editable: boolean;
  onChange?: (n: DocNode) => void;
  citations: CitationView[];
  insertRef?: React.RefObject<((id: string) => void) | null>;
}) {
  const refs = useRef(citations);
  useLayoutEffect(() => {
    refs.current = citations;
  }, [citations]);
  const change = useRef(onChange);
  useEffect(() => {
    change.current = onChange;
  }, [onChange]);
  const [math, setMath] = useState<{
      kind: "inlineMath" | "blockMath";
      latex: string;
      pos?: number;
    } | null>(null),
    [link, setLink] = useState<string | null>(null);
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editable,
    content: initial,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          protocols: ["https", "http", "mailto"],
          HTMLAttributes: {
            rel: "noopener noreferrer nofollow",
            target: "_blank",
          },
        },
      }),
      Mathematics.configure({
        katexOptions: {
          trust: false,
          throwOnError: false,
          maxExpand: 100,
          maxSize: 20,
        },
        inlineOptions: {
          onClick: (n, pos) =>
            setMath({ kind: "inlineMath", latex: n.attrs.latex, pos }),
        },
        blockOptions: {
          onClick: (n, pos) =>
            setMath({ kind: "blockMath", latex: n.attrs.latex, pos }),
        },
      }),
      Node.create({
        name: "citation",
        group: "inline",
        inline: true,
        atom: true,
        selectable: true,
        addAttributes() {
          return { id: { default: null } };
        },
        parseHTML() {
          return [{ tag: "a[data-atlas-citation]" }];
        },
        renderHTML({ node }) {
          return ["a", { "data-atlas-citation": node.attrs.id }, "[reference]"];
        },
        addNodeView() {
          return ({ node }) => {
            const c = refs.current.find((c) => c.id === node.attrs.id),
              dom = document.createElement("a");
            dom.className = "document-citation";
            dom.dataset.atlasCitation = node.attrs.id;
            dom.contentEditable = "false";
            dom.href = c?.href ?? "#";
            dom.title = c
              ? `${c.title}${c.page ? " · p. " + c.page : ""}${c.archived ? " · archived/removed" : ""}`
              : "Unavailable reference";
            dom.textContent = c
              ? `${c.authors[0]?.split(",")[0] ?? "Source"}, ${c.year ?? "n.d."}${c.page ? ", p. " + c.page : ""}`
              : "Unavailable reference";
            dom.addEventListener("click", (event) => {
              if (!c) {
                event.preventDefault();
              }
            });
            return { dom };
          };
        },
      }),
    ],
    editorProps: {
      attributes: {
        class: "atlas-prose",
        role: "textbox",
        "aria-label": "Document body",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor }) => change.current?.(editor.getJSON() as DocNode),
  });
  useEffect(() => {
    editor?.setEditable(editable, false);
  }, [editor, editable]);
  useEffect(() => {
    if (insertRef)
      insertRef.current = (id) => {
        if (!editor) return;
        const content = [
          { type: "citation", attrs: { id } },
          { type: "text", text: " " },
        ];
        if ("node" in editor.state.selection)
          editor
            .chain()
            .focus()
            .insertContentAt(editor.state.doc.content.size, {
              type: "paragraph",
              content,
            })
            .run();
        else editor.chain().focus().insertContent(content).run();
      };
    return () => {
      if (insertRef) insertRef.current = null;
    };
  }, [editor, insertRef]);
  if (!editor) return <p className="muted">Opening editor…</p>;
  const tool = (label: string, fn: () => void, active = false) => (
    <button
      type="button"
      key={label}
      aria-label={label}
      aria-pressed={active}
      onClick={fn}
      disabled={!editable}
    >
      {label}
    </button>
  );
  return (
    <>
      {editable && (
        <div
          className="editor-toolbar"
          role="toolbar"
          aria-label="Text formatting"
        >
          <select
            aria-label="Text style"
            value={
              editor.isActive("heading", { level: 1 })
                ? "1"
                : editor.isActive("heading", { level: 2 })
                  ? "2"
                  : editor.isActive("heading", { level: 3 })
                    ? "3"
                    : "0"
            }
            onChange={(e) => {
              const l = Number(e.target.value);
              if (!l) editor.chain().focus().setParagraph().run();
              else
                editor
                  .chain()
                  .focus()
                  .toggleHeading({ level: l as 1 | 2 | 3 })
                  .run();
            }}
          >
            <option value="0">Paragraph</option>
            <option value="1">Heading 1</option>
            <option value="2">Heading 2</option>
            <option value="3">Heading 3</option>
          </select>
          {tool(
            "Bold",
            () => editor.chain().focus().toggleBold().run(),
            editor.isActive("bold"),
          )}
          {tool(
            "Italic",
            () => editor.chain().focus().toggleItalic().run(),
            editor.isActive("italic"),
          )}
          {tool(
            "Bullet list",
            () => editor.chain().focus().toggleBulletList().run(),
            editor.isActive("bulletList"),
          )}
          {tool(
            "Numbered list",
            () => editor.chain().focus().toggleOrderedList().run(),
            editor.isActive("orderedList"),
          )}
          {tool(
            "Quote",
            () => editor.chain().focus().toggleBlockquote().run(),
            editor.isActive("blockquote"),
          )}
          {tool(
            "Code block",
            () => editor.chain().focus().toggleCodeBlock().run(),
            editor.isActive("codeBlock"),
          )}
          {tool("Link", () => setLink(editor.getAttributes("link").href ?? ""))}
          {tool("Inline math", () =>
            setMath(
              editor.isActive("inlineMath")
                ? {
                    kind: "inlineMath",
                    latex: editor.getAttributes("inlineMath").latex,
                    pos: editor.state.selection.from,
                  }
                : { kind: "inlineMath", latex: "" },
            ),
          )}
          {tool("Block math", () =>
            setMath(
              editor.isActive("blockMath")
                ? {
                    kind: "blockMath",
                    latex: editor.getAttributes("blockMath").latex,
                    pos: editor.state.selection.from,
                  }
                : { kind: "blockMath", latex: "" },
            ),
          )}
          {tool("Undo", () => editor.chain().focus().undo().run())}
          {tool("Redo", () => editor.chain().focus().redo().run())}
        </div>
      )}
      <EditorContent editor={editor} />
      {math && editable && (
        <Modal title="Math expression" onClose={() => setMath(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!math.latex.trim()) return;
              const chain = editor.chain().focus();
              if (math.pos !== undefined) {
                chain.setNodeSelection(math.pos);
                if (math.kind === "inlineMath")
                  chain.updateInlineMath({ latex: math.latex }).run();
                else chain.updateBlockMath({ latex: math.latex }).run();
              } else if (math.kind === "inlineMath")
                chain.insertInlineMath({ latex: math.latex }).run();
              else chain.insertBlockMath({ latex: math.latex }).run();
              setMath(null);
            }}
          >
            <label>
              LaTeX expression
              <textarea
                autoFocus
                required
                maxLength={2000}
                value={math.latex}
                onChange={(e) => setMath({ ...math, latex: e.target.value })}
              />
            </label>
            <p className="muted">
              Notation only. Click an equation to edit it.
            </p>
            <button className="primary">Insert expression</button>
          </form>
        </Modal>
      )}
      {link !== null && (
        <Modal title="Text link" onClose={() => setLink(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!link)
                editor
                  .chain()
                  .focus()
                  .extendMarkRange("link")
                  .unsetLink()
                  .run();
              else {
                const href = safeHref(link);
                if (!href) return;
                editor
                  .chain()
                  .focus()
                  .extendMarkRange("link")
                  .setLink({ href })
                  .run();
              }
              setLink(null);
            }}
          >
            <label>
              URL
              <input
                autoFocus
                type="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
            </label>
            <p className="muted">
              Select text first. Clear the URL to remove its link.
            </p>
            <button className="primary">Apply link</button>
          </form>
        </Modal>
      )}
    </>
  );
}
