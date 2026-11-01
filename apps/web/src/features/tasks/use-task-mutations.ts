'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TaskDto } from '@atlas/core';
import { ApiError } from '@/features/artifacts/client';

/** Fields a pending edit shows before the server confirms it. */
export type TaskView = Pick<
  TaskDto,
  | 'title'
  | 'description'
  | 'status'
  | 'priority'
  | 'assignee'
  | 'milestoneId'
  | 'dueDate'
  | 'archived'
>;
type Overlay = {
  id: number;
  fields: Partial<TaskView>;
  /** Version this edit produced once confirmed; null while pending. */
  version: number | null;
};
export type TaskMutation = {
  label: string;
  fields: Partial<TaskView>;
  send: (expectedVersion: number) => Promise<unknown>;
};

const failureText = (e: unknown, number: number, label: string) =>
  e instanceof ApiError && e.code === 'CONFLICT'
    ? `#${number} changed elsewhere; your ${label} change was not saved. Reloaded the latest version.`
    : e instanceof ApiError && e.code === 'VALIDATION_ERROR'
      ? `The ${label} change was rejected. Check the value and try again.`
      : e instanceof Error
        ? `Unable to update the ${label}: ${e.message}`
        : `Unable to update the ${label}.`;

/**
 * A02 hardening: one ordered write lane per open task.
 *
 * - Edits run strictly one after another, so each one names the version
 *   produced by the previous confirmed edit (task commands bump `version` by
 *   exactly one in SQL). Two pending edits can never share a token.
 * - The token is taken when an edit *starts*, as the larger of the locally
 *   confirmed version and the latest list version. While nothing of ours is
 *   in flight neither can exceed the server's version, so a stale or early
 *   list reload can neither rewind nor overshoot it.
 * - An external change is a real `CONFLICT`: the edit fails truthfully and
 *   the edits queued behind it are discarded unsent (they were based on the
 *   same outdated view), never retried over someone else's work.
 * - Pending and just-confirmed values overlay the list row until a reload at
 *   least as new as their version arrives, so user intent stays visible and
 *   an older reload cannot display superseded values.
 */
export function useTaskMutations({
  task,
  onChanged,
  onFailure,
}: {
  task: Pick<TaskDto, 'id' | 'number' | 'version'> & TaskView;
  onChanged: () => void;
  onFailure: (message: string) => void;
}) {
  const confirmed = useRef(task.version);
  const listed = useRef(task.version);
  const lane = useRef<Promise<void>>(Promise.resolve());
  // Bumped by a conflict: edits queued before it are discarded unsent.
  const epoch = useRef(0);
  const ids = useRef(0);
  const alive = useRef(true);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    listed.current = Math.max(listed.current, task.version);
  }, [task.version]);
  const callbacks = useRef({ onChanged, onFailure, number: task.number });
  useEffect(() => {
    callbacks.current = { onChanged, onFailure, number: task.number };
  });

  const run = useCallback((mutation: TaskMutation) => {
    const id = ++ids.current;
    const startedIn = epoch.current;
    setOverlays((list) => [
      ...list,
      { id, fields: mutation.fields, version: null },
    ]);
    const drop = () =>
      alive.current && setOverlays((list) => list.filter((o) => o.id !== id));
    const step = async () => {
      if (epoch.current !== startedIn) {
        drop();
        return;
      }
      const expected = Math.max(confirmed.current, listed.current);
      try {
        await mutation.send(expected);
        confirmed.current = expected + 1;
        if (alive.current)
          setOverlays((list) =>
            list.map((o) =>
              o.id === id ? { ...o, version: expected + 1 } : o,
            ),
          );
      } catch (e) {
        if (e instanceof ApiError && e.code === 'CONFLICT') epoch.current++;
        drop();
        if (alive.current)
          callbacks.current.onFailure(
            failureText(e, callbacks.current.number, mutation.label),
          );
      } finally {
        if (alive.current) callbacks.current.onChanged();
      }
    };
    const next = lane.current.then(step);
    lane.current = next;
    return next;
  }, []);

  // Confirmed overlays fall away once the list shows their version.
  const active = overlays.filter(
    (o) => o.version === null || o.version > task.version,
  );
  const view: TaskView = Object.assign(
    {
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assignee: task.assignee,
      milestoneId: task.milestoneId,
      dueDate: task.dueDate,
      archived: task.archived,
    },
    ...active.map((o) => o.fields),
  );
  return { run, view, pending: active.some((o) => o.version === null) };
}
