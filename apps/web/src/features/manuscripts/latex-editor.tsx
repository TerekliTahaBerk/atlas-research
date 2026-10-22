'use client';
import { useEffect, useRef } from 'react';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  HighlightStyle,
  StreamLanguage,
  syntaxHighlighting,
} from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import {
  Compartment,
  EditorState,
  RangeSetBuilder,
  type Extension,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  GutterMarker,
  WidgetType,
  gutter,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import type { Problem, TexFile } from '@/lib/preview/manuscript';
/** Syntax colors from the handoff `--syn-*` tokens (theme-aware). */
const latexHighlight = HighlightStyle.define([
  { tag: tags.tagName, color: 'var(--syn-k)' },
  {
    tag: [tags.bracket, tags.brace, tags.squareBracket],
    color: 'var(--syn-b)',
  },
  { tag: tags.atom, color: 'var(--syn-e)' },
  { tag: tags.keyword, color: 'var(--syn-m)' },
  { tag: tags.comment, color: 'var(--syn-c)', fontStyle: 'italic' },
  { tag: tags.number, color: 'var(--syn-n)' },
  { tag: tags.invalid, color: 'var(--danger)' },
]);
class DiagnosticDot extends GutterMarker {
  constructor(private severity: Problem['severity']) {
    super();
  }
  override toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-diag-dot';
    el.style.background =
      this.severity === 'error' ? 'var(--danger)' : 'var(--warn)';
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
}
class PresenceCaret extends WidgetType {
  constructor(private name: string) {
    super();
  }
  override eq(other: PresenceCaret) {
    return other.name === this.name;
  }
  override toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-presence';
    el.dataset.name = this.name;
    el.setAttribute('aria-label', `${this.name} is here (sample presence)`);
    return el;
  }
}
interface Overlay {
  problems: Problem[];
  range: [number, number] | null;
  presence: number | null;
}
function overlayExtensions(
  { problems, range, presence }: Overlay,
  doc: EditorState['doc'],
): Extension {
  const marks = new RangeSetBuilder<Decoration>();
  const lines = new Set<number>();
  for (let n = 1; n <= doc.lines; n += 1) {
    const line = doc.line(n);
    if (range && n >= range[0] && n <= range[1])
      marks.add(
        line.from,
        line.from,
        Decoration.line({ class: 'cm-sync-range' }),
      );
    const problem = problems.find((p) => p.line === n);
    if (problem) {
      lines.add(n);
      if (line.to > line.from)
        marks.add(
          line.from,
          line.to,
          Decoration.mark({
            class:
              problem.severity === 'error' ? 'cm-diag-error' : 'cm-diag-warn',
            attributes: { title: problem.message },
          }),
        );
    }
    if (presence === n)
      marks.add(
        line.to,
        line.to,
        Decoration.widget({ widget: new PresenceCaret('Ayşe'), side: 1 }),
      );
  }
  return [
    EditorView.decorations.of(marks.finish()),
    gutter({
      class: 'cm-diag-gutter',
      lineMarker(view, line) {
        const n = view.state.doc.lineAt(line.from).number;
        const p = problems.find((x) => x.line === n);
        return p && lines.has(n) ? new DiagnosticDot(p.severity) : null;
      },
    }),
  ];
}
/**
 * CodeMirror 6 LaTeX source editor. Edits stay in memory per file; nothing
 * is compiled. Clicking a line number reports it for source→PDF sync.
 */
export function LatexEditor({
  file,
  docs,
  problems,
  range,
  activeLine,
  presenceLine,
  topInset,
  onLineClick,
  onChange,
}: {
  file: TexFile;
  docs: Record<TexFile, string>;
  problems: Problem[];
  range: [number, number] | null;
  activeLine: number | null;
  presenceLine: number | null;
  topInset: number;
  onLineClick: (line: number) => void;
  onChange: (file: TexFile, text: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const overlay = useRef(new Compartment());
  const inset = useRef(new Compartment());
  const callbacks = useRef({ onLineClick, onChange, file });
  useEffect(() => {
    callbacks.current = { onLineClick, onChange, file };
  });
  // Create a fresh state whenever the file changes (edits live in `docs`).
  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const state = EditorState.create({
      doc: docs[file],
      extensions: [
        lineNumbers({
          domEventHandlers: {
            mousedown(v, line) {
              callbacks.current.onLineClick(
                v.state.doc.lineAt(line.from).number,
              );
              return true;
            },
          },
        }),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        StreamLanguage.define(stex),
        syntaxHighlighting(latexHighlight),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({
          'aria-label': `LaTeX source: ${file}`,
          tabindex: '0',
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged)
            callbacks.current.onChange(
              callbacks.current.file,
              u.state.doc.toString(),
            );
        }),
        inset.current.of(
          EditorView.theme({ '.cm-content': { paddingTop: `${topInset}px` } }),
        ),
        overlay.current.of([]),
      ],
    });
    const v = new EditorView({ state, parent });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // `docs` is read only on file switch; live edits flow out via onChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.dispatch({
      effects: overlay.current.reconfigure(
        overlayExtensions(
          { problems, range, presence: presenceLine },
          v.state.doc,
        ),
      ),
    });
  }, [file, presenceLine, problems, range]);
  useEffect(() => {
    view.current?.dispatch({
      effects: inset.current.reconfigure(
        EditorView.theme({ '.cm-content': { paddingTop: `${topInset}px` } }),
      ),
    });
  }, [topInset, file]);
  useEffect(() => {
    const v = view.current;
    if (!v || !activeLine || activeLine > v.state.doc.lines) return;
    const line = v.state.doc.line(activeLine);
    v.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
    });
  }, [activeLine, file]);
  return <div ref={host} className="atlas-cm h-full min-h-0 overflow-hidden" />;
}
