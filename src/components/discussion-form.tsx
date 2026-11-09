"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { DiscussionData, Member } from "@/lib/collaboration-types";
import { InlineError, Modal, useResource } from "./ui";
import { TaskLinkPicker } from "./task-form";
export function DiscussionCreateDialog({
  w,
  p,
  originId,
  origin,
  initialText = "",
  onClose,
}: {
  w: string;
  p: string;
  originId?: string;
  origin?: { sourceId: string; annotationId?: string };
  initialText?: string;
  onClose: () => void;
}) {
  const router = useRouter(),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(initialText),
    [links, setLinks] = useState<string[]>(
      originId
        ? [originId]
        : origin
          ? [origin.annotationId ?? origin.sourceId]
          : [],
    ),
    [mentions, setMentions] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [uncertain, setUncertain] = useState(false);
  const members = useResource<{ members: Member[] }>(
      `/api/projects/${p}/members?workspaceId=${w}`,
    ),
    sending = useRef(false),
    requestId = useRef(crypto.randomUUID()),
    pending = useRef<Record<string, unknown> | null>(null);
  return (
    <Modal
      title="New discussion"
      onClose={() => {
        if (!sending.current) onClose();
      }}
    >
      <form
        className="discussion-create-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (sending.current) return;
          sending.current = true;
          setBusy(true);
          setError(undefined);
          const payload = pending.current ?? {
            requestId: requestId.current,
            title,
            body,
            links,
            mentions,
          };
          pending.current = payload;
          try {
            const d = await api<DiscussionData>(
              `/api/collaboration/${w}/${p}/discussions`,
              payload,
            );
            onClose();
            router.push(`/w/${w}/p/${p}/discussions/${d.id}`);
          } catch (e) {
            setError(e);
            const retry = !(
              e instanceof ApiError && [400, 403, 404, 409].includes(e.status)
            );
            setUncertain(retry);
            if (!retry) pending.current = null;
          } finally {
            sending.current = false;
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy || uncertain}>
          <label>
            Topic title
            <input
              aria-label="Topic title"
              required
              maxLength={300}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            First message
            <textarea
              aria-label="First message"
              required
              rows={4}
              maxLength={20000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <details open={links.length > 0}>
            <summary>Related research and mentions</summary>
            <TaskLinkPicker w={w} p={p} value={links} onChange={setLinks} />
            <label>
              Notify members
              <select
                aria-label="Notify members"
                multiple
                value={mentions}
                onChange={(e) =>
                  setMentions([...e.target.selectedOptions].map((o) => o.value))
                }
              >
                {members.data?.members
                  .filter((m) => m.active)
                  .map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name} · {m.role}
                    </option>
                  ))}
              </select>
            </label>
          </details>
        </fieldset>
        <InlineError error={error} />
        {uncertain && (
          <p role="status">
            Confirmation was interrupted. Your topic and original submission are
            kept for retry.
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Creating…" : error ? "Retry creation" : "Create discussion"}
        </button>
      </form>
    </Modal>
  );
}
