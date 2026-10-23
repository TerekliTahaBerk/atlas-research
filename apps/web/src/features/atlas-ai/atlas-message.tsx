'use client';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  CircleDashed,
  CloudOff,
  Copy,
  CornerDownLeft,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import { SampleTag } from '@/components/atlas/chips';
import { useToast } from '@/components/atlas/toast';
import type { AssistantMessage, AtlasMessage, ReplyPart } from './contracts';
import { useAtlas } from './atlas-provider';
import { LiveMessage } from './live-message';
import { CitePill, SourcePill } from './citations';
/** Visible slice of the answer while the sample "streams". */
function visibleParts(m: AssistantMessage): ReplyPart[] {
  if (m.revealed === Number.POSITIVE_INFINITY) return m.parts;
  let left = m.revealed;
  const out: ReplyPart[] = [];
  for (const p of m.parts) {
    if (p.type === 'cite') {
      if (left > 0 || out.length === 0) out.push(p);
      continue;
    }
    if (left <= 0) break;
    out.push({ ...p, text: p.text.slice(0, left) });
    left -= p.text.length;
  }
  return out;
}
export function plainText(m: AssistantMessage) {
  return (
    m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('') +
    (m.code ? `\n\n${m.code}` : '')
  );
}
export function AtlasMessageView({
  message,
  last,
}: {
  message: AtlasMessage;
  last: boolean;
}) {
  if (message.role === 'user')
    return (
      <div className="flex animate-atlas-rise justify-end pt-3 pb-1.5">
        <div className="max-w-[80%] rounded-xl bg-aiu px-[13px] py-[9px] text-[13.5px] leading-normal text-tx">
          {message.text}
        </div>
      </div>
    );
  return message.live ? (
    <LiveMessage message={message} />
  ) : (
    <AssistantBlock message={message} last={last} />
  );
}
function AssistantBlock({
  message: m,
  last,
}: {
  message: AssistantMessage;
  last: boolean;
}) {
  const atlas = useAtlas();
  const flash = useToast();
  const thinking = m.phase === 'think';
  const streaming = m.phase === 'stream';
  const done = m.phase === 'done';
  const sourceIndex = (paper: string) =>
    Math.max(1, m.sources.indexOf(paper as never) + 1);
  return (
    <article
      aria-label="Atlas sample response"
      aria-busy={thinking || streaming}
      className="animate-atlas-rise border-b border-bd2 pt-2.5 pb-3"
    >
      {thinking ? (
        <div className="flex flex-col gap-0.5 pt-0.5 pb-1" role="status">
          <div className="flex h-6 items-center gap-2 text-ctl">
            <Sparkles aria-hidden="true" className="size-[13px] text-actx" />
            <span className="shimmer-text font-medium">
              {m.steps[m.step] ?? 'Thinking'}…
            </span>
            <SampleTag>Preview</SampleTag>
          </div>
          <ol className="ml-1.5 flex flex-col gap-px border-l border-bd2 pl-1">
            {m.steps.map((s, i) => (
              <li
                key={s}
                className={cn(
                  'flex h-[22px] items-center gap-2 pl-2.5 text-xs transition-opacity',
                  i < m.step
                    ? 'text-tx2'
                    : i === m.step
                      ? 'text-tx'
                      : 'text-tx3 opacity-55',
                )}
              >
                {i < m.step ? (
                  <Check aria-hidden="true" className="size-3 text-actx" />
                ) : i === m.step ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-3 animate-spin text-tx3"
                  />
                ) : (
                  <Circle aria-hidden="true" className="size-2 text-tx3" />
                )}
                {s}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {!thinking && m.duration !== undefined ? (
        <>
          <button
            type="button"
            aria-expanded={Boolean(m.showSteps)}
            onClick={() => atlas.toggleSteps(m.id)}
            className="mb-1 inline-flex h-[22px] items-center gap-1.5 rounded-sm pr-1.5 pl-0.5 text-[11.5px] text-tx3 hover:bg-el hover:text-tx2"
          >
            <Sparkles aria-hidden="true" className="size-[11px] text-actx" />
            {m.stopped && m.parts.length === 1 && !m.code
              ? 'Stopped'
              : `Preview sequence · ${m.duration.toFixed(1)}s`}
            <span aria-hidden="true">·</span>
            {m.steps.length} steps
            {m.showSteps ? (
              <ChevronUp aria-hidden="true" className="size-[11px]" />
            ) : (
              <ChevronDown aria-hidden="true" className="size-[11px]" />
            )}
          </button>
          {m.showSteps ? (
            <ol className="mb-2 ml-1.5 flex animate-atlas-rise flex-col gap-px border-l border-bd2 pl-1">
              {m.steps.map((s) => (
                <li
                  key={s}
                  className="flex h-[21px] items-center gap-2 pl-2.5 text-[11.5px] text-tx3"
                >
                  <Check aria-hidden="true" className="size-[11px] text-actx" />
                  {s}
                </li>
              ))}
            </ol>
          ) : null}
        </>
      ) : null}
      {streaming || done ? (
        <div className="text-[13.5px] leading-[1.62] text-tx">
          {visibleParts(m).map((p, i) =>
            p.type === 'text' ? (
              <span key={i} className={p.strong ? 'font-semibold' : undefined}>
                {p.text}
              </span>
            ) : (
              <CitePill key={i} paper={p.paper} n={sourceIndex(p.paper)} />
            ),
          )}
          {streaming ? (
            <span
              aria-hidden="true"
              className="ml-0.5 inline-block h-3.5 w-[7px] animate-atlas-blink rounded-[1px] bg-actx align-[-2px]"
            />
          ) : null}
        </div>
      ) : null}
      {done && m.code ? (
        <pre className="mt-2.5 animate-atlas-rise rounded-lg border border-bd2 bg-code px-3 py-2.5 font-mono text-xs leading-[1.6] whitespace-pre-wrap text-[var(--syn-t)]">
          {m.code}
        </pre>
      ) : null}
      {done && m.list?.length ? (
        <ul className="mt-2 flex animate-atlas-rise flex-col gap-1">
          {m.list.map((item) => (
            <li
              key={item}
              className="flex items-center gap-2 rounded-md border border-bd2 px-[9px] py-1.5 text-ctl"
            >
              <CircleDashed aria-hidden="true" className="size-3 text-tx3" />
              {item}
            </li>
          ))}
        </ul>
      ) : null}
      {done && m.sources.length ? (
        <div className="mt-[9px] flex animate-atlas-rise flex-wrap gap-[5px]">
          {m.sources.map((s, i) => (
            <SourcePill key={s} paper={s} n={i + 1} />
          ))}
        </div>
      ) : null}
      {m.phase === 'error' ? (
        <div
          role="alert"
          className="flex animate-atlas-rise items-start gap-2.5 rounded-lg border border-danger/35 bg-dangers px-3 py-2.5 text-ctl"
        >
          <CloudOff
            aria-hidden="true"
            className="mt-px size-[14px] text-danger"
          />
          <div className="flex-1">
            <div className="font-medium">Atlas couldn’t reach your sources</div>
            <div className="text-tx2">
              Nothing was changed. This is the sample error state — no request
              was made.
            </div>
          </div>
          <button
            type="button"
            onClick={() => atlas.retry(m.id)}
            className="inline-flex h-[26px] items-center gap-[5px] rounded-md border border-bd px-[9px] text-xs hover:bg-hov"
          >
            <RotateCcw aria-hidden="true" className="size-3" />
            Retry
          </button>
        </div>
      ) : null}
      {done ? (
        <div className="mt-2.5 flex animate-atlas-fade items-center gap-1.5">
          {last ? (
            <ActionChip onClick={atlas.clear} icon={<X />}>
              Clear chat
            </ActionChip>
          ) : null}
          <ActionChip
            icon={<Copy />}
            onClick={() => {
              void navigator.clipboard?.writeText(plainText(m)).catch(() => {});
              flash('Copied the sample response to the clipboard', 'done');
            }}
          >
            Copy
          </ActionChip>
          <ActionChip
            icon={<CornerDownLeft />}
            onClick={() =>
              flash('Insert is a preview — nothing was added to your work')
            }
          >
            {atlas.screen === 'manuscript'
              ? 'Insert at cursor'
              : 'Insert below'}
          </ActionChip>
          {m.stopped ? (
            <span className="text-[11px] text-warn">Stopped</span>
          ) : null}
          <span className="flex-1" />
          <span className="text-[10.5px] text-tx3">Sample response</span>
        </div>
      ) : null}
    </article>
  );
}
function ActionChip({
  icon,
  children,
  onClick,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-6 items-center gap-[5px] rounded-sm bg-el px-2 text-[11.5px] text-tx2 hover:bg-hov hover:text-tx [&_svg]:size-[11px]"
    >
      {icon}
      {children}
    </button>
  );
}
