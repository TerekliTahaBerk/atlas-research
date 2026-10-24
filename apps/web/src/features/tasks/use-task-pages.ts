'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TaskDto, TaskListQuery, TaskPage } from '@atlas/core';
import { ApiError, fetchTasks } from '@/features/artifacts/client';

type Query = { [K in keyof TaskListQuery]?: TaskListQuery[K] | undefined };
type State = {
  key: string;
  scope: string;
  data: TaskPage | null;
  error: string;
  moreError: string;
  paging: boolean;
};
const denied = (e: unknown) =>
  e instanceof ApiError &&
  ['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND'].includes(e.code);
const message = (e: unknown) =>
  e instanceof Error ? e.message : 'Tasks could not be loaded.';

/** One shared Board/List generation. No page or mutation can cross its scope. */
export function useTaskPages(projectId: string, query: Query) {
  const scope = JSON.stringify([projectId, query]);
  const [refresh, setRefresh] = useState(0);
  const key = `${scope}:${refresh}`;
  const [state, setState] = useState<State | null>(null);
  const generation = useRef({ active: false, busy: false });
  const depth = useRef({ scope, pages: 1 });
  const reload = useCallback(() => {
    // Invalidate synchronously, including a page already in flight.
    generation.current.active = false;
    setRefresh((n) => n + 1);
  }, []);
  useEffect(() => {
    const request = { active: true, busy: true };
    generation.current = request;
    const count = depth.current.scope === scope ? depth.current.pages : 1;
    depth.current = { scope, pages: count };
    async function load() {
      try {
        let data = await fetchTasks(projectId, query);
        let pages = 1;
        while (request.active && data.nextCursor && pages < count) {
          const next = await fetchTasks(projectId, {
            ...query,
            cursor: data.nextCursor,
          });
          const items = new Map(data.items.map((t) => [t.id, t]));
          for (const task of next.items) items.set(task.id, task);
          data = { ...next, items: [...items.values()] };
          pages++;
        }
        if (!request.active) return;
        depth.current = { scope, pages };
        setState({ key, scope, data, error: '', moreError: '', paging: false });
      } catch (e) {
        if (request.active)
          setState({
            key,
            scope,
            data: null,
            error: message(e),
            moreError: '',
            paging: false,
          });
      } finally {
        request.busy = false;
      }
    }
    void load();
    return () => {
      request.active = false;
    };
    // The serialized key represents the complete query; object identity is irrelevant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // Keep this scope's cards mounted during reconciliation, so a confirmed
  // move cannot interrupt the next keyboard/drag interaction. Different
  // projects and filters still hide their old rows immediately.
  const current = state?.scope === scope ? state : null;
  async function loadMore() {
    const request = generation.current;
    const cursor = current?.data?.nextCursor;
    if (!cursor || !request.active || request.busy) return;
    request.busy = true;
    setState((s) =>
      s?.key === key ? { ...s, paging: true, moreError: '' } : s,
    );
    try {
      const next = await fetchTasks(projectId, { ...query, cursor });
      if (!request.active) return;
      depth.current.pages++;
      setState((s) => {
        if (s?.key !== key || !s.data) return s;
        const items = new Map(s.data.items.map((t) => [t.id, t]));
        for (const task of next.items) {
          const previous = items.get(task.id);
          // An older page must not overwrite an optimistic or newer mutation.
          if (!previous || previous.version < task.version)
            items.set(task.id, task);
        }
        return {
          ...s,
          data: { ...next, items: [...items.values()] },
          paging: false,
        };
      });
    } catch (e) {
      if (request.active)
        setState((s) =>
          s?.key === key
            ? denied(e)
              ? {
                  key,
                  scope,
                  data: null,
                  error: message(e),
                  moreError: '',
                  paging: false,
                }
              : { ...s, paging: false, moreError: message(e) }
            : s,
        );
    } finally {
      request.busy = false;
    }
  }
  function setTasks(update: (tasks: TaskDto[]) => TaskDto[]) {
    setState((s) =>
      s?.key === key && s.data
        ? { ...s, data: { ...s.data, items: update(s.data.items) } }
        : s,
    );
  }
  return {
    data: current?.data ?? null,
    error: current?.error ?? '',
    moreError: current?.moreError ?? '',
    paging: current?.paging ?? false,
    loading: current?.key !== key,
    loadMore,
    reload,
    setTasks,
  };
}
