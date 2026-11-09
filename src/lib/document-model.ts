// Atlas document v1: a bounded, allowlisted Tiptap JSON tree. Never persisted HTML.
export type DocNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: DocNode[];
};
export const emptyDocument: DocNode = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
export function safeHref(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const u = new URL(value);
    return ["https:", "http:", "mailto:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}
export function cleanDocument(value: unknown): DocNode {
  let count = 0,
    characters = 0;
  const blocks = new Set([
    "paragraph",
    "heading",
    "bulletList",
    "orderedList",
    "listItem",
    "blockquote",
    "codeBlock",
    "horizontalRule",
    "blockMath",
  ]);
  function node(raw: unknown, depth: number, parent: string): DocNode {
    if (
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw) ||
      depth > 25 ||
      ++count > 5000
    )
      throw new Error("Invalid document");
    const r = raw as DocNode,
      t = r.type;
    if (
      ![
        "doc",
        "text",
        "hardBreak",
        "citation",
        "inlineMath",
        ...blocks,
      ].includes(t)
    )
      throw new Error("Unsupported document node");
    if ((depth === 0) !== (t === "doc")) throw new Error("Invalid root");
    const inline = ["text", "hardBreak", "citation", "inlineMath"].includes(t);
    if (
      depth &&
      ((["paragraph", "heading"].includes(parent) && !inline) ||
        (parent === "codeBlock" && t !== "text") ||
        (["bulletList", "orderedList"].includes(parent) && t !== "listItem") ||
        (["doc", "blockquote", "listItem"].includes(parent) && !blocks.has(t)))
    )
      throw new Error("Invalid structure");
    const out: DocNode = { type: t };
    if (t === "text") {
      if (typeof r.text !== "string" || !r.text.length)
        throw new Error("Invalid text");
      characters += r.text.length;
      out.text = r.text;
    }
    if (t === "heading") {
      const l = r.attrs?.level;
      if (![1, 2, 3].includes(Number(l))) throw new Error("Invalid heading");
      out.attrs = { level: l };
    }
    if (t === "orderedList")
      out.attrs = {
        start: Math.max(1, Math.min(10000, Number(r.attrs?.start) || 1)),
      };
    if (t === "codeBlock") out.attrs = { language: null };
    if (t === "citation") {
      const id = r.attrs?.id;
      if (
        typeof id !== "string" ||
        !/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(id)
      )
        throw new Error("Invalid citation");
      out.attrs = { id };
    }
    if (t === "inlineMath" || t === "blockMath") {
      const latex = r.attrs?.latex;
      if (typeof latex !== "string" || !latex.length || latex.length > 2000)
        throw new Error("Invalid math");
      out.attrs = { latex };
    }
    if (r.marks?.length) {
      if (!["text", "hardBreak"].includes(t) || r.marks.length > 5)
        throw new Error("Invalid marks");
      out.marks = r.marks.map((m) => {
        if (
          !["bold", "italic", "strike", "code", "link", "underline"].includes(
            m.type,
          )
        )
          throw new Error("Invalid mark");
        if (m.type === "link") {
          const href = safeHref(m.attrs?.href);
          if (!href) throw new Error("Invalid link");
          return {
            type: "link",
            attrs: {
              href,
              target: "_blank",
              rel: "noopener noreferrer nofollow",
            },
          };
        }
        return { type: m.type };
      });
    }
    if (r.content) {
      if (
        !Array.isArray(r.content) ||
        [
          "text",
          "hardBreak",
          "citation",
          "inlineMath",
          "blockMath",
          "horizontalRule",
        ].includes(t)
      )
        throw new Error("Invalid children");
      out.content = r.content.map((c) => node(c, depth + 1, t));
    }
    if (
      ["doc", "bulletList", "orderedList", "listItem", "blockquote"].includes(
        t,
      ) &&
      !out.content?.length
    )
      throw new Error("Empty container");
    if (t === "listItem" && out.content?.[0]?.type !== "paragraph")
      throw new Error("Invalid list item");
    return out;
  }
  const out = node(value, 0, "");
  if (characters > 200000) throw new Error("Document too large");
  return out;
}
export function citationIds(node: DocNode): string[] {
  return [
    ...new Set([
      ...(node.type === "citation" ? [String(node.attrs?.id)] : []),
      ...(node.content ?? []).flatMap(citationIds),
    ]),
  ];
}
export function plainDocument(n: DocNode): string {
  return (
    n.text ??
    (["inlineMath", "blockMath"].includes(n.type)
      ? String(n.attrs?.latex)
      : n.type === "citation"
        ? "[reference]"
        : (n.content ?? [])
            .map(plainDocument)
            .join(
              ["doc", "blockquote", "listItem"].includes(n.type) ? "\n" : "",
            ))
  );
}
const escapeMd = (t: string) => t.replace(/[\\`*_{}[\]<>#!|~]/g, "\\$&");
export function documentMarkdown(
  n: DocNode,
  numbers: Map<string, number>,
): string {
  const inner = (n.content ?? [])
    .map((c) => documentMarkdown(c, numbers))
    .join("");
  switch (n.type) {
    case "doc":
      return inner;
    case "text": {
      let t = escapeMd(n.text ?? "");
      for (const m of n.marks ?? []) {
        if (m.type === "bold") t = `**${t}**`;
        if (m.type === "italic") t = `*${t}*`;
        if (m.type === "strike") t = `~~${t}~~`;
        if (m.type === "underline") t = `<u>${t}</u>`;
        if (m.type === "code")
          t = "`" + (n.text ?? "").replaceAll("`", "\\`") + "`";
        if (m.type === "link")
          t = `[${t}](${String(m.attrs?.href).replaceAll(")", "%29").replaceAll("(", "%28")})`;
      }
      return t;
    }
    case "paragraph":
      return inner + "\n\n";
    case "heading":
      return "#".repeat(Number(n.attrs?.level)) + " " + inner + "\n\n";
    case "hardBreak":
      return "  \n";
    case "inlineMath":
      return "$" + n.attrs?.latex + "$";
    case "blockMath":
      return "$$\n" + n.attrs?.latex + "\n$$\n\n";
    case "citation":
      return `[${numbers.get(String(n.attrs?.id)) ?? "?"}]`;
    case "bulletList":
    case "orderedList":
      return (
        (n.content ?? [])
          .map(
            (c, i) =>
              (n.type === "bulletList"
                ? "- "
                : `${i + Number(n.attrs?.start ?? 1)}. `) +
              documentMarkdown(c, numbers).trim().replaceAll("\n", "\n  ") +
              "\n",
          )
          .join("") + "\n"
      );
    case "listItem":
      return inner;
    case "blockquote":
      return (
        inner
          .trim()
          .split("\n")
          .map((l) => "> " + l)
          .join("\n") + "\n\n"
      );
    case "codeBlock": {
      const text = (n.content ?? []).map((c) => c.text ?? "").join("");
      const fence = "`".repeat(
        Math.max(3, ...(text.match(/`+/g) ?? []).map((v) => v.length + 1)),
      );
      return fence + "\n" + text + "\n" + fence + "\n\n";
    }
    case "horizontalRule":
      return "---\n\n";
    default:
      return inner;
  }
}
export { escapeMd };
