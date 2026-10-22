'use client';
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { PaperId } from '@/lib/preview/research';
import {
  tasks as sampleTasks,
  type ChannelKey,
  type ChannelMessage,
  type SampleTask,
} from '@/lib/preview/workspace';
/**
 * In-memory preview state shared across screens for one browser session
 * (prototype single-component state). Never written to storage; a reload
 * returns every fixture to its authored state.
 */
interface PreviewStore {
  saved: PaperId[];
  toggleSaved: (id: PaperId) => void;
  saveMany: (ids: PaperId[]) => void;
  tasks: SampleTask[];
  moveTask: (id: string, status: SampleTask['status']) => void;
  readAll: boolean;
  markAllRead: () => void;
  readIds: string[];
  markRead: (id: string) => void;
  channelDrafts: Partial<Record<ChannelKey, ChannelMessage[]>>;
  addChannelMessages: (channel: ChannelKey, messages: ChannelMessage[]) => void;
  docCites: PaperId[];
  addDocCite: (id: PaperId) => void;
}
const Store = createContext<PreviewStore | null>(null);
const fallback: PreviewStore = {
  saved: ['p1', 'p2'],
  toggleSaved: () => {},
  saveMany: () => {},
  tasks: sampleTasks,
  moveTask: () => {},
  readAll: false,
  markAllRead: () => {},
  readIds: [],
  markRead: () => {},
  channelDrafts: {},
  addChannelMessages: () => {},
  docCites: [],
  addDocCite: () => {},
};
export function PreviewStoreProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<PaperId[]>(['p1', 'p2']);
  const [tasks, setTasks] = useState<SampleTask[]>(() =>
    sampleTasks.map((t) => ({ ...t })),
  );
  const [readAll, setReadAll] = useState(false);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [channelDrafts, setChannelDrafts] = useState<
    PreviewStore['channelDrafts']
  >({});
  const [docCites, setDocCites] = useState<PaperId[]>([]);
  const value = useMemo<PreviewStore>(
    () => ({
      saved,
      toggleSaved: (id) =>
        setSaved((s) =>
          s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
        ),
      saveMany: (ids) => setSaved((s) => Array.from(new Set([...s, ...ids]))),
      tasks,
      moveTask: (id, status) =>
        setTasks((list) =>
          list.map((t) => (t.id === id ? { ...t, status } : t)),
        ),
      readAll,
      markAllRead: () => setReadAll(true),
      readIds,
      markRead: (id) =>
        setReadIds((ids) => (ids.includes(id) ? ids : [...ids, id])),
      channelDrafts,
      addChannelMessages: (channel, messages) =>
        setChannelDrafts((d) => ({
          ...d,
          [channel]: [...(d[channel] ?? []), ...messages],
        })),
      docCites,
      addDocCite: (id) => setDocCites((c) => (c.includes(id) ? c : [...c, id])),
    }),
    [channelDrafts, docCites, readAll, readIds, saved, tasks],
  );
  return <Store.Provider value={value}>{children}</Store.Provider>;
}
export function usePreviewStore() {
  return useContext(Store) ?? fallback;
}
