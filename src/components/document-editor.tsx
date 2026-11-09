"use client";
import { PopoverMenu } from "./ui";
import { BubbleMenu } from "@tiptap/react/menus";
import katex from "katex";
import { useEditor, EditorContent } from "@tiptap/react";
import { sinkListItem, liftListItem } from "@tiptap/pm/schema-list";
import { Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Mathematics from "@tiptap/extension-mathematics";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DocNode } from "@/lib/document-model";
import { safeHref } from "@/lib/document-model";
import type { CitationView } from "@/lib/collaboration-types";
import { Modal, Icon } from "./ui";
import "katex/dist/katex.min.css";
export type EditorControls = {
  focus: () => void;
  heading: (index: number) => void;
  selection: () => string;
};
const selectionMenuOptions = { placement: "top" as const, offset: 8 };
export function RichEditor({
  initial,
  editable,
  onChange,
  citations,
  insertRef,
  onCitation,
  onCitationSelect,
  onResearch,
  editorRef,
}: {
  onCitation?: () => void;
  onCitationSelect?: (id: string) => void;
  onResearch?: (kind: "task" | "discussion", text: string) => void;
  editorRef?: React.RefObject<EditorControls | null>;
  initial: DocNode;
  editable: boolean;
  onChange?: (n: DocNode) => void;
  citations: CitationView[];
  insertRef?: React.RefObject<((id: string, quote?: string) => void) | null>;
}) {
  const citationClick = useRef(onCitationSelect),
    renderers = useRef(new Set<() => void>());
  const refs = useRef(citations);
  useLayoutEffect(() => {
    refs.current = citations;
    citationClick.current = onCitationSelect;
    renderers.current.forEach((render) => render());
  }, [citations, onCitationSelect]);
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
            const dom = document.createElement("a");
            let currentNode = node,
              c: CitationView | undefined;
            dom.className = "document-citation";
            dom.contentEditable = "false";
            const refresh = () => {
              c = refs.current.find((c) => c.id === currentNode.attrs.id);
              dom.dataset.atlasCitation = currentNode.attrs.id;
              dom.href = c?.href ?? "#";
              dom.title = c
                ? `${c.title}${c.page ? " · p. " + c.page : ""}${c.archived ? " · archived target" : ""}`
                : "Unavailable reference";
              dom.textContent = c
                ? `${c.authors[0]?.split(",")[0] ?? "Source"}, ${c.year ?? "n.d."}${c.page ? ", p. " + c.page : ""}`
                : "Unavailable reference";
              dom.setAttribute(
                "aria-label",
                dom.textContent + " — source details",
              );
            };
            refresh();
            renderers.current.add(refresh);
            dom.addEventListener("click", (event) => {
              if (!c) {
                event.preventDefault();
                return;
              }
              if (citationClick.current && !event.metaKey && !event.ctrlKey) {
                event.preventDefault();
                citationClick.current(c.id);
              }
            });
            return {
              dom,
              update(next) {
                if (next.type.name !== "citation") return false;
                currentNode = next;
                refresh();
                return true;
              },
              destroy() {
                renderers.current.delete(refresh);
              },
            };
          };
        },
      }),
    ],
    editorProps: {
      handleKeyDown(view, event) {
        if (event.key !== "Tab") return false;
        return (
          event.shiftKey
            ? liftListItem(view.state.schema.nodes.listItem)
            : sinkListItem(view.state.schema.nodes.listItem)
        )(view.state, view.dispatch);
      },
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
      insertRef.current = (id, quote) => {
        if (quote && editor) {
          editor
            .chain()
            .focus()
            .insertContentAt(editor.state.selection.to, [
              {
                type: "blockquote",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: quote }],
                  },
                ],
              },
              {
                type: "paragraph",
                content: [
                  { type: "citation", attrs: { id } },
                  { type: "text", text: " " },
                ],
              },
            ])
            .run();
          return;
        }
        if (!editor) return;
        const content = [
          { type: "citation", attrs: { id } },
          { type: "text", text: " " },
        ];
        if ("node" in editor.state.selection)
          editor
            .chain()
            .focus()
            .insertContentAt(editor.state.selection.to, {
              type: "paragraph",
              content,
            })
            .run();
        else
          editor
            .chain()
            .focus()
            .insertContentAt(editor.state.selection.to, content)
            .run();
      };
    return () => {
      if (insertRef) insertRef.current = null;
    };
  }, [editor, insertRef]);
  useEffect(() => {
    if (!editorRef || !editor) return;
    editorRef.current = {
      focus: () => {
        if (!editor.isDestroyed) editor.commands.focus();
      },
      selection: () =>
        editor.state.doc
          .textBetween(
            editor.state.selection.from,
            editor.state.selection.to,
            "\n",
          )
          .slice(0, 6000),
      heading: (index) => {
        let n = 0;
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === "heading" && n++ === index)
            editor
              .chain()
              .focus()
              .setTextSelection(pos + 1)
              .scrollIntoView()
              .run();
        });
      },
    };
    return () => {
      editorRef.current = null;
    };
  }, [editor, editorRef]);
  if (!editor) return <p className="muted">Opening editor…</p>;
  const returnToWriting = () =>
    requestAnimationFrame(() => {
      if (!editor.isDestroyed) editor.commands.focus();
    });
  const tool = (label: string, fn: () => void, active = false) => (
    <button
      type="button"
      key={label}
      aria-label={label}
      aria-pressed={active}
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={fn}
      disabled={!editable}
    >
      {label === "Bold" ? (
        <b>B</b>
      ) : label === "Italic" ? (
        <i>I</i>
      ) : label === "Link" ? (
        <Icon name="link" />
      ) : label === "Undo" ? (
        <Icon name="undo" />
      ) : label === "Redo" ? (
        <Icon name="redo" />
      ) : (
        label
      )}
    </button>
  );
  let mathError = "";
  if (math?.latex.trim())
    try {
      katex.renderToString(math.latex, {
        displayMode: math.kind === "blockMath",
        trust: false,
        throwOnError: true,
        maxExpand: 100,
        maxSize: 20,
      });
    } catch {
      mathError =
        "This expression could not be rendered. Check the syntax; your input is kept.";
    }
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
          <PopoverMenu className="editor-insert">
            <summary className="toolbar-button">
              <Icon name="plus" /> Insert
            </summary>
            <div
              className="editor-insert-menu"
              onClick={(e) => {
                const target = e.target as HTMLElement;
                if (target.closest("button"))
                  target.closest("details")?.removeAttribute("open");
              }}
            >
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
              {tool("Divider", () =>
                editor.chain().focus().setHorizontalRule().run(),
              )}
              {tool(
                "Underline",
                () => editor.chain().focus().toggleUnderline().run(),
                editor.isActive("underline"),
              )}
              {tool(
                "Strikethrough",
                () => editor.chain().focus().toggleStrike().run(),
                editor.isActive("strike"),
              )}
              {tool(
                "Inline code",
                () => editor.chain().focus().toggleCode().run(),
                editor.isActive("code"),
              )}
              {tool("Link", () =>
                setLink(editor.getAttributes("link").href ?? ""),
              )}
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
              {onCitation && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={onCitation}
                >
                  <Icon name="book" /> Citation
                </button>
              )}
            </div>
          </PopoverMenu>
          {tool("Undo", () => editor.chain().focus().undo().run())}
          {tool("Redo", () => editor.chain().focus().redo().run())}
        </div>
      )}
      {editable && (
        <BubbleMenu
          editor={editor}
          options={selectionMenuOptions}
          className="selection-toolbar"
          aria-label="Selection formatting"
        >
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
          {tool("Link", () => setLink(editor.getAttributes("link").href ?? ""))}
          {tool(
            "Quote",
            () => editor.chain().focus().toggleBlockquote().run(),
            editor.isActive("blockquote"),
          )}
          {onResearch && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                onResearch(
                  "task",
                  editor.state.doc.textBetween(
                    editor.state.selection.from,
                    editor.state.selection.to,
                    "\n",
                  ),
                )
              }
            >
              Create task
            </button>
          )}
          {onCitation && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onCitation}
              aria-label="Cite selection"
            >
              <Icon name="book" />
            </button>
          )}
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
      {math && editable && (
        <Modal
          title="Math expression"
          onClose={() => {
            setMath(null);
            returnToWriting();
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!math.latex.trim() || mathError) return;
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
              returnToWriting();
            }}
          >
            <label>
              Placement
              <select
                aria-label="Equation placement"
                disabled={math.pos !== undefined}
                value={math.kind}
                onChange={(e) =>
                  setMath({
                    ...math,
                    kind: e.target.value as "inlineMath" | "blockMath",
                  })
                }
              >
                <option value="inlineMath">In the sentence</option>
                <option value="blockMath">On its own line</option>
              </select>
            </label>
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
            <div className="math-examples">
              {[
                "p < 0.05",
                "\\frac{a}{b}",
                "\\sum_{i=1}^{n} x_i",
                "\\int_0^1 x^2 \\mathrm{d}x",
                "\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}",
              ].map((expression) => (
                <button
                  key={expression}
                  type="button"
                  onClick={() => setMath({ ...math, latex: expression })}
                >
                  {expression}
                </button>
              ))}
            </div>
            <MathPreview
              latex={math.latex}
              display={math.kind === "blockMath"}
            />
            <p className="muted">
              Click any equation in your writing to edit it.
            </p>
            {mathError && <p role="alert">{mathError}</p>}
            <button
              className="primary"
              disabled={!!mathError || !math.latex.trim()}
            >
              {math.pos === undefined
                ? "Insert expression"
                : "Update expression"}
            </button>
          </form>
        </Modal>
      )}
      {link !== null && (
        <Modal
          title="Text link"
          onClose={() => {
            setLink(null);
            returnToWriting();
          }}
        >
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
              returnToWriting();
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
            {link && !safeHref(link) && (
              <p role="alert">
                Use a complete https, http or mailto address. Your input is
                kept.
              </p>
            )}
            <button className="primary" disabled={!!link && !safeHref(link)}>
              Apply link
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

function MathPreview({ latex, display }: { latex: string; display: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current)
      katex.render(latex || "x", ref.current, {
        displayMode: display,
        trust: false,
        throwOnError: false,
        maxExpand: 100,
        maxSize: 20,
      });
  }, [latex, display]);
  return (
    <div className="math-preview" aria-label="Equation preview" ref={ref} />
  );
}
