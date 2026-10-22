'use client';
import { Fragment } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileCode,
  FileText,
  ListTodo,
  Play,
  Plus,
  Sparkles,
} from 'lucide-react';
import { Btn } from '@/components/atlas/button';
import { InlineRef, SampleTag } from '@/components/atlas/chips';
import { useToast } from '@/components/atlas/toast';
import { useAtlas } from '@/features/atlas-ai/atlas-provider';
import { AtlasAnchor } from '@/features/atlas-ai/atlas-surface';
import { SharePopover } from '@/features/overlays/share-popover';
import { moduleHref } from '@/features/shell/navigation';
import { Crumb, Topbar } from '@/features/shell/topbar';
import { notebookCells, sweepRows } from '@/lib/preview/extras';
/** Tiny Python tokenizer for display only (prototype `pyTok`). */
function tokens(code: string) {
  const out: { t: string; c: string }[] = [];
  const re =
    /(#.*$)|("[^"]*"|'[^']*')|\b(import|as|from|def|return|for|in|if|else)\b|\b(\d+(?:\.\d+)?)\b|([\w.]+(?=\())|([\s\S])/gm;
  let buf = '';
  const flush = () => {
    if (buf) out.push({ t: buf, c: 'var(--syn-t)' });
    buf = '';
  };
  for (const m of code.matchAll(re)) {
    const [, comment, str, kw, num, call, other] = m;
    const push = (t: string, c: string) => {
      flush();
      out.push({ t, c });
    };
    if (comment) push(comment, 'var(--syn-c)');
    else if (str) push(str, 'var(--syn-m)');
    else if (kw) push(kw, 'var(--syn-k)');
    else if (num) push(num, 'var(--syn-n)');
    else if (call) push(call, 'var(--syn-e)');
    else buf += other ?? '';
  }
  flush();
  return out;
}
/**
 * Experiments notebook (handoff §6 "Experiments"). Outputs are recorded
 * sample results; no kernel exists and no code is executed.
 */
export function ExperimentsScreen() {
  const router = useRouter();
  const flash = useToast();
  const atlas = useAtlas();
  const noRun = () =>
    flash(
      'Code execution needs the Phase 07 sandbox — showing recorded sample output',
    );
  return (
    <div className="aic-wide flex min-h-0 flex-1 flex-col">
      <Topbar
        actions={
          <>
            <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-tx2 max-sm:hidden">
              <span
                aria-hidden="true"
                className="size-[7px] rounded-full bg-tx3"
              />
              Python 3.11 · kernel not connected
            </span>
            <Btn variant="secondary" onClick={noRun}>
              <Play aria-hidden="true" className="!size-3" />
              Run all
            </Btn>
            <SharePopover resource="run_14_block_sparsity.ipynb" />
          </>
        }
      >
        <Crumb
          parent="Experiments"
          title="run_14_block_sparsity.ipynb"
          mono
          as="span"
        />
      </Topbar>
      <AtlasAnchor placement="canvas" reserve="wide" />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[900px] px-8 pt-[calc(64px+var(--aic))] pb-[120px] max-sm:px-4">
          <div className="mb-[22px] flex flex-wrap items-center gap-1.5 text-xs text-tx3">
            Linked
            <InlineRef
              icon={<ListTodo aria-hidden="true" />}
              onClick={() => router.push(moduleHref('tasks', 'task=ATL-31'))}
            >
              ATL-31
            </InlineRef>
            <InlineRef
              icon={<FileText aria-hidden="true" />}
              onClick={() => router.push(moduleHref('documents', 'doc=d1'))}
            >
              Related work — sparse attention
            </InlineRef>
            <InlineRef
              icon={<FileCode aria-hidden="true" />}
              onClick={() => router.push(moduleHref('manuscripts'))}
            >
              Table 1 · main.tex
            </InlineRef>
          </div>
          <h1 className="mb-2 font-serif text-[34px] leading-[1.1] font-medium">
            Block size sweep
          </h1>
          <p className="mb-[26px] font-read text-[15px] leading-[1.7] text-tx2">
            Does block sparsity hurt long-range contacts? Sweep of block sizes
            16–128 on 48 CASP15 targets longer than 800 residues, batch size 1,
            A100 80GB. <SampleTag>Recorded sample notebook</SampleTag>
          </p>
          <ol aria-label="Notebook cells">
            {notebookCells.map((cell, i) => (
              <li key={i} className="mb-3.5 flex gap-2.5">
                <div className="flex w-11 shrink-0 flex-col items-end gap-1 pt-2">
                  {cell.kind === 'code' ? (
                    <>
                      <button
                        type="button"
                        aria-label={`Run cell ${cell.n}`}
                        onClick={noRun}
                        className="grid size-[26px] place-items-center rounded-md text-tx3 hover:bg-hov hover:text-tx"
                      >
                        <Play aria-hidden="true" className="size-[13px]" />
                      </button>
                      <span className="font-mono text-[10.5px] text-tx3">
                        [{cell.n}]
                      </span>
                    </>
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  {cell.kind === 'code' ? (
                    <>
                      <div className="overflow-hidden rounded-lg border border-bd2 bg-code">
                        <div className="flex items-center gap-2 border-b border-bd2 px-2.5 py-[5px] text-[11px] text-tx3">
                          <span className="font-mono">Python</span>
                          <span className="flex-1" />
                          <span>
                            Recorded output · {cell.duration} · 3h ago
                          </span>
                          <Btn
                            variant="aiGhost"
                            size="xs"
                            className="h-5 px-1.5 text-[11px] font-normal"
                            onClick={() =>
                              atlas.ask({
                                mode: 'open',
                                chips: [
                                  {
                                    id: `cell-${cell.n}`,
                                    kind: 'experiment',
                                    title: `run_14 · cell [${cell.n}]`,
                                  },
                                ],
                                prompt: 'Explain this result',
                              })
                            }
                          >
                            <Sparkles
                              aria-hidden="true"
                              className="!size-[11px]"
                            />
                            Explain
                          </Btn>
                        </div>
                        <pre className="overflow-x-auto px-3 py-2.5 font-mono text-ctl leading-[1.65] whitespace-pre-wrap">
                          <code>
                            {tokens(cell.source).map((t, j) => (
                              <span key={j} style={{ color: t.c }}>
                                {t.t}
                              </span>
                            ))}
                          </code>
                        </pre>
                      </div>
                      {cell.output === 'table' ? (
                        <div className="mt-2 overflow-x-auto rounded-lg border border-bd2">
                          <table className="tnum w-full min-w-[420px] font-mono text-xs">
                            <thead>
                              <tr className="border-b border-bd2 bg-card text-tx3">
                                {[
                                  'block_size',
                                  'lddt',
                                  'mem_gb',
                                  'contact_p@L',
                                ].map((h) => (
                                  <th
                                    key={h}
                                    scope="col"
                                    className="px-3 py-[7px] text-left font-normal"
                                  >
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {sweepRows.map((r) => (
                                <tr
                                  key={r.block}
                                  className={
                                    r.block === 64
                                      ? 'border-b border-bd2 bg-acs'
                                      : 'border-b border-bd2'
                                  }
                                >
                                  <td className="px-3 py-1.5">{r.block}</td>
                                  <td className="px-3 py-1.5">{r.lddt}</td>
                                  <td className="px-3 py-1.5">{r.mem}</td>
                                  <td className="px-3 py-1.5">{r.pAtL}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                      {cell.output === 'chart' ? (
                        <figure className="mt-2 rounded-lg border border-bd2 bg-card px-4 pt-3.5 pb-2.5">
                          <figcaption className="mb-3 flex flex-wrap gap-3.5 text-[11.5px] text-tx2">
                            <span className="flex items-center gap-[5px]">
                              <span
                                aria-hidden="true"
                                className="size-2.5 rounded-[2px] bg-ac"
                              />
                              Contact P@L
                            </span>
                            <span className="flex items-center gap-[5px]">
                              <span
                                aria-hidden="true"
                                className="size-2.5 rounded-[2px] bg-tx3 opacity-70"
                              />
                              Peak memory (GB, ÷50)
                            </span>
                            <span className="flex-1" />
                            <span className="text-tx3">
                              Figure · sweep.pdf · sample
                            </span>
                          </figcaption>
                          <div
                            role="img"
                            aria-label="Bar chart: contact P@L falls from 0.71 to 0.61 and peak memory from 38.2 to 12.9 GB as block size grows from 16 to 128"
                            className="flex h-[150px] items-end gap-7 border-b border-bd px-3 max-sm:gap-3"
                          >
                            {sweepRows.map((r) => (
                              <div
                                key={r.block}
                                className="flex h-full flex-1 items-end justify-center gap-1"
                              >
                                <span
                                  className="w-[18px] rounded-t-[3px] bg-ac"
                                  style={{
                                    height: `${Math.round(parseFloat(r.pAtL) * 190)}px`,
                                  }}
                                />
                                <span
                                  className="w-[18px] rounded-t-[3px] bg-tx3 opacity-70"
                                  style={{
                                    height: `${Math.round((parseFloat(r.mem) / 50) * 190)}px`,
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                          <div
                            aria-hidden="true"
                            className="flex gap-7 px-3 pt-1.5 font-mono text-[11px] text-tx3 max-sm:gap-3"
                          >
                            {sweepRows.map((r) => (
                              <span
                                key={r.block}
                                className="flex-1 text-center"
                              >
                                {r.block}
                              </span>
                            ))}
                          </div>
                        </figure>
                      ) : null}
                    </>
                  ) : null}
                  {cell.kind === 'ai' ? (
                    <section
                      aria-label="Atlas reading of this result"
                      className="rounded-xl border border-aiib bg-acs px-3.5 py-3"
                    >
                      <div className="mb-1.5 flex items-center gap-2 text-ctl">
                        <Sparkles
                          aria-hidden="true"
                          className="size-[13px] text-actx"
                        />
                        <span className="font-semibold">
                          Atlas reading of this result
                        </span>
                        <span className="flex-1" />
                        <SampleTag>Sample analysis</SampleTag>
                      </div>
                      <p className="mb-2.5 text-[13.5px] leading-[1.6]">
                        Contact precision falls 10% from block 64 to 128 while
                        peak memory drops 25%. Block 64 keeps P@L within 4% of
                        block 16 at 45% of the memory — a reasonable default.
                        Next, test a hybrid local + global pattern at 128 to
                        recover long-range contacts.
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <Btn
                          variant="primary"
                          size="md"
                          onClick={() =>
                            flash(
                              'Inserting a cell is a preview — the notebook was not changed',
                            )
                          }
                        >
                          Insert as markdown
                        </Btn>
                        <Btn
                          variant="outline"
                          size="md"
                          className="border-aiib"
                          onClick={() =>
                            atlas.ask({
                              mode: 'open',
                              prompt:
                                'Draft the next run config for a hybrid local+global pattern at block 128',
                            })
                          }
                        >
                          Draft next run
                        </Btn>
                        <Btn
                          variant="ghost"
                          size="md"
                          onClick={() =>
                            flash(
                              'Task creation is a preview — nothing was created',
                            )
                          }
                        >
                          Create task
                        </Btn>
                      </div>
                    </section>
                  ) : null}
                  {cell.kind === 'md' ? (
                    <div className="px-0.5 py-1.5">
                      <h2 className="mb-1 font-serif text-[22px] font-medium">
                        {cell.heading}
                      </h2>
                      <p className="font-read text-[14.5px] leading-[1.7] text-tx2">
                        {cell.body}
                      </p>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-1.5 pl-[54px] max-sm:pl-0">
            {(['Code', 'Markdown'] as const).map((k) => (
              <Fragment key={k}>
                <button
                  type="button"
                  onClick={() =>
                    flash(
                      'Adding cells is a preview — the notebook was not changed',
                    )
                  }
                  className="inline-flex h-7 items-center gap-[5px] rounded-md border border-dashed border-bd px-2.5 text-xs text-tx2 hover:bg-hov"
                >
                  <Plus aria-hidden="true" className="size-3" />
                  {k}
                </button>
              </Fragment>
            ))}
            <button
              type="button"
              onClick={() =>
                atlas.ask({ mode: 'focus', draft: 'Generate a cell that ' })
              }
              className="inline-flex h-7 items-center gap-[5px] rounded-md border border-dashed border-aiib px-2.5 text-xs text-actx hover:bg-acs"
            >
              <Sparkles aria-hidden="true" className="size-3" />
              Generate with Atlas
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
