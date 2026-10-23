'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import {
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  PanelRight,
  PictureInPicture2,
  Sparkles,
  X,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import { Btn, IconBtn } from '@/components/atlas/button';
import { Kbd, RefChip, SampleTag } from '@/components/atlas/chips';
import { useMediaQuery } from '@/features/shell/use-media';
import {
  screenContexts,
  type AtlasMode,
  type AtlasPlacement,
  type ContextReference,
} from './contracts';
import { useAtlas } from './atlas-provider';
import { AtlasComposer, kindIcons } from './atlas-composer';
import { LiveControls } from './live-controls';
import { AtlasMessageView } from './atlas-message';
/**
 * One assistant surface, positioned by mode (handoff §5). The same composer,
 * context chips and conversation render in every placement.
 */
export function AtlasSurface({ placement }: { placement: AtlasPlacement }) {
  const atlas = useAtlas();
  const ctx = screenContexts[atlas.screen];
  const expanded =
    placement === 'panel' ||
    placement === 'focus' ||
    placement === 'page' ||
    atlas.mode !== 'compact';
  const floating =
    placement === 'canvas' || placement === 'editor' || placement === 'focus';
  const neutral = placement === 'editor';
  const scroller = useRef<HTMLDivElement>(null);
  const count = atlas.messages.length;
  const lastLength = (() => {
    const last = atlas.messages[count - 1];
    return last && last.role === 'assistant'
      ? `${last.phase}${last.step}${last.revealed}`
      : '';
  })();
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count, lastLength, expanded]);
  return (
    <aside
      aria-label="Atlas AI assistant"
      data-mode={atlas.mode}
      data-placement={placement}
      className={cn(
        'flex min-h-0 flex-col font-sans',
        placement === 'canvas' &&
          cn(
            'rounded-2xl border border-bd2 bg-pop',
            expanded ? 'shadow-pop' : 'shadow-soft',
          ),
        placement === 'editor' &&
          (expanded
            ? 'rounded-2xl border border-bd bg-pop shadow-pop'
            : 'rounded-2xl border border-transparent bg-code pb-1.5'),
        placement === 'focus' &&
          'rounded-2xl border border-bd bg-pop shadow-pop',
        placement === 'panel' &&
          'h-full rounded-xl border border-bd2 bg-canvas',
        placement === 'page' && 'h-full',
      )}
    >
      {placement === 'panel' ? (
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-2 text-ctl">
          <Sparkles aria-hidden="true" className="size-[14px] text-actx" />
          <span className="font-semibold">Atlas</span>
          <span className="text-tx3">{ctx.label} context</span>
          <span className="flex-1" />
          <IconBtn
            label="Float"
            size="base"
            onClick={() => atlas.setMode('open')}
          >
            <PictureInPicture2 aria-hidden="true" className="size-[14px]" />
          </IconBtn>
          <IconBtn
            label="Close Atlas panel"
            size="base"
            onClick={() => atlas.setMode('compact')}
          >
            <X aria-hidden="true" className="size-[14px]" />
          </IconBtn>
        </div>
      ) : null}
      <div
        className={
          placement === 'panel'
            ? 'px-2.5'
            : placement === 'page'
              ? ''
              : 'px-1.5 pt-1.5'
        }
      >
        <AtlasComposer
          tone={neutral ? 'neutral' : 'green'}
          placeholder={
            atlas.live
              ? 'Ask about authorized research — @papers or /summarize'
              : ctx.placeholder
          }
          height={placement === 'page' ? 46 : 42}
        />
      </div>
      {expanded && atlas.live ? <LiveControls /> : null}
      {expanded ? (
        <div
          className={cn(
            'flex min-h-0 flex-col origin-top',
            placement === 'panel' || placement === 'page'
              ? 'flex-1'
              : 'flex-initial',
            atlas.closing
              ? 'animate-atlas-collapse'
              : placement === 'panel'
                ? 'animate-atlas-fade'
                : placement === 'page'
                  ? ''
                  : 'animate-atlas-expand',
          )}
        >
          <ContextRow
            chips={atlas.chips}
            onRemove={atlas.removeChip}
            controls={
              floating ? (
                <>
                  <IconBtn
                    label={
                      atlas.mode === 'focus' ? 'Exit focus (⌘J)' : 'Focus (⌘J)'
                    }
                    size="md"
                    tone="muted"
                    onClick={atlas.toggleFocus}
                  >
                    {atlas.mode === 'focus' ? (
                      <Minimize2 aria-hidden="true" className="size-[13px]" />
                    ) : (
                      <Maximize2 aria-hidden="true" className="size-[13px]" />
                    )}
                  </IconBtn>
                  <IconBtn
                    label="Dock to side"
                    size="md"
                    tone="muted"
                    onClick={() => atlas.setMode('panel')}
                  >
                    <PanelRight aria-hidden="true" className="size-[13px]" />
                  </IconBtn>
                  {placement !== 'focus' ? (
                    <IconBtn
                      label="Collapse Atlas"
                      size="md"
                      tone="muted"
                      onClick={atlas.collapse}
                    >
                      <ChevronUp aria-hidden="true" className="size-[14px]" />
                    </IconBtn>
                  ) : null}
                </>
              ) : null
            }
          />
          <div
            ref={scroller}
            className={cn(
              'mt-1.5 overflow-y-auto border-t border-bd2 px-[22px] pt-1 pb-3',
              placement === 'panel' || placement === 'page'
                ? 'min-h-0 flex-1'
                : '',
              placement === 'focus' ? 'max-h-[56vh]' : '',
              placement === 'canvas' || placement === 'editor'
                ? 'max-h-[min(460px,calc(100vh-220px))]'
                : '',
            )}
          >
            {atlas.messages.length === 0 ? (
              <div className="py-7 text-center text-ctl text-tx3">
                <Sparkles
                  aria-hidden="true"
                  className="mx-auto size-[18px] text-actx"
                />
                <div className="mt-2 text-tx2">
                  {atlas.live
                    ? 'Ask a grounded research question.'
                    : 'Ask about anything in this context.'}
                </div>
                <div>
                  {atlas.live
                    ? 'Attach papers with @ and approve processing above before sending.'
                    : 'Type @ to reference a paper, task or person, or / for commands.'}
                </div>
                <div className="mt-2">
                  <SampleTag>
                    {atlas.live
                      ? atlas.engine.service.enabled
                        ? 'Authorized research context only'
                        : 'Provider configuration and security activation required'
                      : 'Answers are prewritten samples'}
                  </SampleTag>
                </div>
              </div>
            ) : (
              atlas.messages.map((m, i) => (
                <AtlasMessageView
                  key={m.id}
                  message={m}
                  last={i === atlas.messages.length - 1}
                />
              ))
            )}
          </div>
        </div>
      ) : placement === 'canvas' ? (
        <button
          type="button"
          onClick={() => {
            atlas.setMode('open');
            atlas.focusInput();
          }}
          className="atlas-strip flex h-[26px] w-full animate-atlas-fade items-center gap-1.5 px-3.5 text-xs text-tx3 hover:text-tx2"
        >
          {/* The visible text names the control (WCAG 2.5.3). */}
          <span className="sr-only">Expand Atlas conversation:</span>
          {atlas.busy ? (
            <span className="size-1.5 animate-atlas-pulse rounded-full bg-actx" />
          ) : null}
          <span>Chat</span>
          <span className="text-[11px]">
            · {atlas.messages.length} messages
          </span>
          <span className="flex-1" />
          <Kbd className="h-4 border-bd2 bg-transparent">⌘J</Kbd>
          <ChevronDown aria-hidden="true" className="size-[13px]" />
        </button>
      ) : null}
    </aside>
  );
}
function ContextRow({
  chips,
  onRemove,
  controls,
}: {
  chips: ContextReference[];
  onRemove: (id: string) => void;
  controls: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-[5px] px-3 pt-1.5 pb-0.5">
      {chips.map((c) => {
        const Icon = kindIcons[c.kind];
        return (
          <RefChip
            key={c.id}
            title={c.title}
            icon={Icon ? <Icon aria-hidden="true" /> : null}
            onRemove={() => onRemove(c.id)}
            removeLabel={`Remove ${c.title}`}
          >
            {c.title}
          </RefChip>
        );
      })}
      {chips.length === 0 ? (
        <span className="text-[11.5px] text-tx3">
          No context attached · type @
        </span>
      ) : null}
      <span className="flex-1" />
      {controls}
    </div>
  );
}
/** Where a screen hosts the floating composer (compact/open modes). */
export function AtlasAnchor({
  placement,
  reserve = 'default',
}: {
  placement: 'canvas' | 'editor';
  /** `wide` keeps clear of a dense topbar (pair with `.aic-wide`). */
  reserve?: 'default' | 'wide';
}) {
  const atlas = useAtlas();
  if (atlas.mode === 'focus' || atlas.mode === 'panel') return null;
  return (
    <div
      className={
        placement === 'canvas'
          ? cn('atlas-float', reserve === 'wide' && 'atlas-float-wide')
          : 'absolute top-2 right-3 left-3 z-30'
      }
    >
      <AtlasSurface placement={placement} />
    </div>
  );
}
/** Shell-level layer: focus mode (modal, dimmed) and docked panel. */
export function AtlasLayer() {
  const atlas = useAtlas();
  const returnFocus = useRef<HTMLElement | null>(null);
  const narrow = useMediaQuery('(max-width: 899px)');
  const anchored =
    screenContexts[atlas.screen].floating ||
    atlas.screen === 'ai' ||
    (atlas.screen === 'manuscript' && atlas.editorComposer);
  const effective: AtlasMode =
    atlas.mode === 'open' && !anchored ? 'focus' : atlas.mode;
  return (
    <>
      <DialogPrimitive.Root
        open={effective === 'focus'}
        onOpenChange={(open) => {
          if (!open) atlas.setMode(anchored ? 'open' : 'compact');
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[68] animate-atlas-fade bg-dim backdrop-blur-[7px]" />
          <DialogPrimitive.Content
            data-atlas-focus=""
            aria-describedby={undefined}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              returnFocus.current =
                document.activeElement as HTMLElement | null;
              atlas.focusInput();
            }}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              const target = returnFocus.current;
              if (
                target !== document.body &&
                target?.isConnected &&
                target.getClientRects().length
              )
                target.focus();
              else atlas.focusInput();
            }}
            onEscapeKeyDown={(e) => {
              if (atlas.menuOpen.current) {
                e.preventDefault();
                return;
              }
              if (atlas.busy) {
                e.preventDefault();
                atlas.stop();
              }
            }}
            className="fixed top-[max(64px,16vh)] left-1/2 z-[70] w-[min(720px,calc(100vw-32px))] -translate-x-1/2 outline-none"
          >
            <DialogPrimitive.Title className="sr-only">
              Atlas AI — focus mode
            </DialogPrimitive.Title>
            <AtlasSurface placement="focus" />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      {effective === 'panel' ? (
        <div
          className={cn(
            'z-30',
            narrow
              ? 'fixed inset-x-1.5 bottom-1.5 h-[78vh] animate-atlas-rise'
              : 'fixed top-1.5 right-1.5 bottom-1.5 w-[380px]',
          )}
        >
          <AtlasSurface placement="panel" />
        </div>
      ) : null}
    </>
  );
}
/** Inline entry point inside content (handoff mode 5). */
export function ContextualAITrigger({
  children,
  prompt,
  chips,
  mode,
  draft,
  variant = 'ai',
  size = 'base',
  className,
}: {
  children: ReactNode;
  prompt?: string;
  chips?: ContextReference[];
  mode?: AtlasMode;
  draft?: string;
  variant?: 'ai' | 'aiGhost';
  size?: 'xs' | 'sm' | 'md' | 'base' | 'lg';
  className?: string;
}) {
  const atlas = useAtlas();
  return (
    <Btn
      variant={variant}
      size={size}
      className={className}
      onClick={() =>
        atlas.ask({
          ...(prompt ? { prompt } : {}),
          ...(chips ? { chips } : {}),
          ...(mode ? { mode } : {}),
          ...(draft !== undefined ? { draft } : {}),
        })
      }
    >
      <Sparkles aria-hidden="true" />
      {children}
    </Btn>
  );
}
/** Single pulsing dot + specific status text (handoff §8 loading). */
export function AIStatusIndicator({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn('flex items-center gap-2 text-ctl text-tx2', className)}
    >
      <span
        aria-hidden="true"
        className="size-1.5 animate-atlas-pulse rounded-full bg-actx"
      />
      {children}
    </div>
  );
}
