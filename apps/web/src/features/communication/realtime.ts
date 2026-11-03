'use client';
import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { realtimeEvent, type RealtimeEvent } from '@atlas/core';
import { browserSupabase } from '@/features/identity/browser';

/*
 * Private Supabase Realtime delivery. A topic is joined only with the
 * signed-in user's own access token; the database policy decides whether the
 * join is allowed. Events carry identifiers only, so a dropped, duplicated
 * or late event can at most delay a cursor backfill — never lose or invent
 * content. `onResync` runs on every (re)subscription and when the browser
 * comes back online; it must backfill from the last applied cursor.
 */
export type LiveStatus =
  'connecting' | 'live' | 'reconnecting' | 'offline' | 'unavailable';

let shared: SupabaseClient | null | undefined;
function client() {
  if (shared !== undefined) return shared;
  try {
    shared = browserSupabase();
  } catch {
    shared = null;
  }
  return shared;
}

export function useRealtimeTopic(
  topic: string | null,
  onEvent: (event: RealtimeEvent) => void,
  onResync: () => void,
  onDenied?: () => void,
  options: { skipInitialResync?: boolean } = {},
): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const handlers = useRef({ onEvent, onResync, onDenied });
  useEffect(() => {
    handlers.current = { onEvent, onResync, onDenied };
  });
  useEffect(() => {
    if (!topic) return;
    const supabase = client();
    if (!supabase) {
      queueMicrotask(() => setStatus('unavailable'));
      return;
    }
    let alive = true;
    let joinedOnce = false;
    let channel: ReturnType<SupabaseClient['channel']> | undefined;
    const online = () => {
      if (!alive) return;
      setStatus((s) => (s === 'offline' ? 'reconnecting' : s));
      handlers.current.onResync();
    };
    const offline = () => alive && setStatus('offline');
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        await supabase.realtime.setAuth(data.session?.access_token ?? null);
      } catch {
        if (alive) setStatus('unavailable');
        return;
      }
      if (!alive) return;
      channel = supabase.channel(topic, { config: { private: true } });
      channel.on('broadcast', { event: '*' }, (message) => {
        const parsed = realtimeEvent.safeParse({
          event: message.event,
          payload: message.payload,
        });
        if (parsed.success && alive) handlers.current.onEvent(parsed.data);
      });
      channel.subscribe((state, error) => {
        if (!alive) return;
        if (state === 'SUBSCRIBED') {
          setStatus('live');
          // Close the gap between the last fetch and this subscription.
          if (!options.skipInitialResync || joinedOnce)
            handlers.current.onResync();
          joinedOnce = true;
        } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
          setStatus(navigator.onLine ? 'reconnecting' : 'offline');
          // A refused join may mean the topic rotated or access was revoked;
          // the owner re-fetches its authorized topic from the server.
          if (error?.message.includes('Unauthorized'))
            handlers.current.onDenied?.();
        } else if (state === 'CLOSED') setStatus('reconnecting');
      });
    })();
    return () => {
      alive = false;
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      if (channel) void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic]);
  return topic ? status : 'connecting';
}
