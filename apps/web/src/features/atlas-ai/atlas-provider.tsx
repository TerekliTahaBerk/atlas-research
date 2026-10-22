'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { screenFromPath, type ScreenKey } from '@/features/shell/navigation';
import {
  screenContexts,
  type AssistantMessage,
  type AtlasMessage,
  type AtlasMode,
  type ContextReference,
} from './contracts';
import { initialMessages, previewSteps, sampleReply } from './sample-replies';
/**
 * Single Atlas AI state shared by every placement (compact, open, focus,
 * panel and inline entry points). Thinking/streaming is a labeled
 * presentation sequence over prewritten sample content: nothing is sent,
 * read or generated. Reduced-motion users get the final state immediately.
 */
export interface AtlasApi {
  screen: ScreenKey;
  mode: AtlasMode;
  closing: boolean;
  setMode: (mode: AtlasMode) => void;
  collapse: () => void;
  toggleFocus: () => void;
  input: string;
  setInput: (value: string) => void;
  chips: ContextReference[];
  addChip: (chip: ContextReference) => void;
  removeChip: (id: string) => void;
  messages: AtlasMessage[];
  busy: boolean;
  send: (text?: string) => void;
  /** Inline entry point: attach context, open a mode and optionally ask. */
  ask: (options: {
    prompt?: string;
    chips?: ContextReference[];
    mode?: AtlasMode;
    draft?: string;
  }) => void;
  stop: () => void;
  retry: (id: string) => void;
  clear: () => void;
  toggleSteps: (id: string) => void;
  /** Set while a mention/slash menu is open so Escape closes it first. */
  menuOpen: React.RefObject<boolean>;
  setMenuOpen: (open: boolean) => void;
  focusInput: () => void;
  registerInput: (el: HTMLInputElement | null) => void;
  /** Manuscript-only: whether the inline editor composer is shown. */
  editorComposer: boolean;
  setEditorComposer: (value: boolean) => void;
}
const AtlasContext = createContext<AtlasApi | null>(null);
export function useAtlas() {
  const value = useContext(AtlasContext);
  if (!value) throw new Error('Atlas UI requires <AtlasProvider>.');
  return value;
}
function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}
function demoErrors() {
  return (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('demo') === 'errors'
  );
}
function textLength(m: AssistantMessage) {
  return m.parts.reduce(
    (n, p) => n + (p.type === 'text' ? p.text.length : 0),
    0,
  );
}
let messageSeq = 0;
export function AtlasProvider({
  children,
  screen: screenOverride,
}: {
  children: ReactNode;
  /** Tests and isolated previews may pin the screen context. */
  screen?: ScreenKey;
}) {
  const pathname = usePathname();
  const screen = screenOverride ?? screenFromPath(pathname ?? '/app/home');
  const [mode, setModeState] = useState<AtlasMode>('compact');
  const [closing, setClosing] = useState(false);
  const [input, setInput] = useState('');
  const [chips, setChips] = useState<ContextReference[]>(
    screenContexts[screen].chips,
  );
  const [messages, setMessages] = useState<AtlasMessage[]>(initialMessages);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editorComposer, setEditorComposer] = useState(true);
  const [prevScreen, setPrevScreen] = useState(screen);
  const menuOpen = useRef(false);
  const inputEl = useRef<HTMLInputElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  // Route change: context follows the screen; an expanded float collapses
  // and focus mode steps back to open (prototype `go()`).
  if (screen !== prevScreen) {
    setPrevScreen(screen);
    setChips(screenContexts[screen].chips);
    setClosing(false);
    if (mode === 'open') setModeState('compact');
    if (mode === 'focus') setModeState('open');
  }
  const setMode = useCallback((next: AtlasMode) => {
    clearTimeout(closeTimer.current);
    setClosing(false);
    setModeState(next);
  }, []);
  const collapse = useCallback(() => {
    clearTimeout(closeTimer.current);
    if (prefersReducedMotion()) {
      setModeState('compact');
      return;
    }
    setClosing(true);
    closeTimer.current = setTimeout(() => {
      setModeState('compact');
      setClosing(false);
    }, 170);
  }, []);
  const toggleFocus = useCallback(() => {
    setClosing(false);
    setModeState((m) => (m === 'focus' ? 'open' : 'focus'));
  }, []);
  const focusInput = useCallback(() => {
    requestAnimationFrame(() => inputEl.current?.focus());
  }, []);
  const registerInput = useCallback((el: HTMLInputElement | null) => {
    inputEl.current = el;
  }, []);
  const contextLabel = chips[0]?.title ?? 'this workspace';
  const send = useCallback(
    (raw?: string) => {
      const text = (raw ?? input).trim();
      if (!text || busyId) return;
      const id = `a${++messageSeq}`;
      const reply = sampleReply(text, screen, contextLabel);
      const instant = prefersReducedMotion();
      const steps = previewSteps(text, contextLabel);
      const failed = demoErrors();
      const assistant: AssistantMessage = {
        id,
        role: 'assistant',
        phase: instant ? (failed ? 'error' : 'done') : 'think',
        steps,
        step: instant ? steps.length : 0,
        startedAt: Date.now(),
        ...(instant ? { duration: 0 } : {}),
        parts: reply.parts,
        revealed: instant ? Number.POSITIVE_INFINITY : 0,
        ...(reply.code ? { code: reply.code } : {}),
        ...(reply.list ? { list: reply.list } : {}),
        sources: reply.sources,
        query: text,
      };
      setMessages((list) => [
        ...list,
        { id: `u${messageSeq}`, role: 'user', text },
        assistant,
      ]);
      setInput('');
      clearTimeout(closeTimer.current);
      setClosing(false);
      setModeState((m) => (m === 'compact' ? 'open' : m));
      if (!instant) setBusyId(id);
    },
    [busyId, contextLabel, input, screen],
  );
  const update = useCallback(
    (id: string, patch: (m: AssistantMessage) => Partial<AssistantMessage>) =>
      setMessages((list) =>
        list.map((m) =>
          m.id === id && m.role === 'assistant' ? { ...m, ...patch(m) } : m,
        ),
      ),
    [],
  );
  // Presentation sequence for the busy sample message.
  const busyMessage = messages.find(
    (m): m is AssistantMessage => m.id === busyId && m.role === 'assistant',
  );
  const phase = busyMessage?.phase;
  const step = busyMessage?.step;
  useEffect(() => {
    if (!busyId || !phase) return;
    if (phase === 'think') {
      const timer = setTimeout(
        () => {
          update(busyId, (m) => {
            const next = m.step + 1;
            if (next < m.steps.length) return { step: next };
            const duration = (Date.now() - m.startedAt) / 1000;
            if (demoErrors())
              return { phase: 'error', step: m.steps.length, duration };
            return { phase: 'stream', step: m.steps.length, duration };
          });
        },
        step === 0 ? 460 : 360 + ((step ?? 0) % 3) * 140,
      );
      return () => clearTimeout(timer);
    }
    if (phase === 'stream') {
      const timer = setInterval(() => {
        update(busyId, (m) => {
          const total = textLength(m);
          const revealed = Math.min(total, m.revealed + 6);
          return revealed >= total
            ? { phase: 'done', revealed: Number.POSITIVE_INFINITY }
            : { revealed };
        });
      }, 30);
      return () => clearInterval(timer);
    }
    const done = setTimeout(() => setBusyId(null), 0);
    return () => clearTimeout(done);
  }, [busyId, phase, step, update]);
  const stop = useCallback(() => {
    if (!busyId) return;
    update(busyId, (m) =>
      m.phase === 'think'
        ? {
            phase: 'done',
            stopped: true,
            parts: [{ type: 'text', text: 'Stopped before answering.' }],
            sources: [],
            revealed: Number.POSITIVE_INFINITY,
            duration: (Date.now() - m.startedAt) / 1000,
          }
        : { phase: 'done', stopped: true },
    );
    setBusyId(null);
  }, [busyId, update]);
  const retry = useCallback(
    (id: string) => {
      if (prefersReducedMotion()) {
        update(id, (m) => ({
          phase: 'done',
          step: m.steps.length,
          revealed: Number.POSITIVE_INFINITY,
        }));
        return;
      }
      update(id, () => ({
        phase: 'think',
        step: 0,
        startedAt: Date.now(),
        revealed: 0,
      }));
      setBusyId(id);
    },
    [update],
  );
  const ask = useCallback<AtlasApi['ask']>(
    ({ prompt, chips: extra, mode: nextMode, draft }) => {
      if (extra?.length)
        setChips((list) => [
          ...list,
          ...extra.filter((c) => !list.some((x) => x.id === c.id)),
        ]);
      setClosing(false);
      setModeState((m) => nextMode ?? (m === 'compact' ? 'open' : m));
      if (draft !== undefined) {
        setInput(draft);
        focusInput();
      }
      if (prompt) setTimeout(() => send(prompt), 0);
    },
    [focusInput, send],
  );
  const setMenuOpen = useCallback((open: boolean) => {
    menuOpen.current = open;
  }, []);
  // ⌘/Ctrl+J toggles focus mode; Escape steps down open → compact.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === 'j') {
        event.preventDefault();
        toggleFocus();
        return;
      }
      if (key !== 'escape' || event.defaultPrevented) return;
      if (
        document.querySelector(
          '[role="dialog"][data-state="open"], [role="menu"][data-state="open"], [data-radix-popper-content-wrapper]',
        )
      )
        return;
      if (menuOpen.current) return;
      if (busyId) {
        event.preventDefault();
        stop();
        return;
      }
      if (mode === 'open') {
        event.preventDefault();
        collapse();
        inputEl.current?.blur();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busyId, collapse, mode, stop, toggleFocus]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  // `?atlas=open|focus|panel` deep link (QA frames and tests). Deferred so
  // the server-rendered compact state hydrates first.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('atlas');
    if (requested !== 'open' && requested !== 'focus' && requested !== 'panel')
      return;
    const id = setTimeout(() => setModeState(requested), 0);
    return () => clearTimeout(id);
  }, []);
  const value = useMemo<AtlasApi>(
    () => ({
      screen,
      mode,
      closing,
      setMode,
      collapse,
      toggleFocus,
      input,
      setInput,
      chips,
      addChip: (chip) =>
        setChips((list) =>
          list.some((c) => c.id === chip.id) ? list : [...list, chip],
        ),
      removeChip: (id) => setChips((list) => list.filter((c) => c.id !== id)),
      messages,
      busy: Boolean(busyId),
      send,
      ask,
      stop,
      retry,
      clear: () => setMessages([]),
      toggleSteps: (id) => update(id, (m) => ({ showSteps: !m.showSteps })),
      menuOpen,
      setMenuOpen,
      focusInput,
      registerInput,
      editorComposer,
      setEditorComposer,
    }),
    [
      ask,
      busyId,
      chips,
      closing,
      collapse,
      editorComposer,
      focusInput,
      input,
      messages,
      mode,
      registerInput,
      retry,
      screen,
      send,
      setMenuOpen,
      setMode,
      stop,
      toggleFocus,
      update,
    ],
  );
  return (
    <AtlasContext.Provider value={value}>{children}</AtlasContext.Provider>
  );
}
