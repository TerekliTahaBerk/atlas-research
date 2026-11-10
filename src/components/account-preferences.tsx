"use client";
import { useState, useSyncExternalStore } from "react";
import { api, ApiError } from "@/lib/api";
import type { Preferences } from "@/lib/inbox-types";
import { Failure, InlineError, Loading, useResource } from "./ui";
function subscribe(listener: () => void) {
  window.addEventListener("atlas-theme", listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener("atlas-theme", listener);
    window.removeEventListener("storage", listener);
  };
}
const snapshot = () =>
  document.documentElement.dataset.theme === "dark" ? "dark" : "light";
export function AppearanceSettings() {
  const theme = useSyncExternalStore(subscribe, snapshot, () => "light"),
    [error, setError] = useState(false),
    [notice, setNotice] = useState("");
  function choose(next: string) {
    try {
      localStorage.setItem("atlas-theme", next);
      if (localStorage.getItem("atlas-theme") !== next) throw new Error();
      document.documentElement.setAttribute("data-theme", next);
      window.dispatchEvent(new Event("atlas-theme"));
      setError(false);
      setNotice("Appearance saved on this browser.");
    } catch {
      setError(true);
      setNotice("");
    }
  }
  return (
    <section className="settings-section">
      <h2>Appearance</h2>
      <p>
        Choose how Atlas looks on this browser. This uses your existing device
        preference.
      </p>
      <div
        className="settings-theme-options"
        role="group"
        aria-label="Color theme"
      >
        {["light", "dark"].map((t) => (
          <button
            key={t}
            className={`settings-theme theme-${t}`}
            aria-pressed={theme === t}
            onClick={() => choose(t)}
          >
            <span className="theme-preview">
              <span />
              <span />
            </span>
            {t === "light" ? "Light" : "Dark"}
            {theme === t ? " · Selected" : ""}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert">
          Appearance could not be saved. Allow browser storage, then choose the
          theme again.
        </p>
      )}
      <p role="status">{notice}</p>
    </section>
  );
}
export function NotificationSettings() {
  const data = useResource<Preferences>("/api/me/preferences");
  return (
    <section className="settings-section">
      <h2>Notifications</h2>
      <p>
        Choose which future events reach your in-app Inbox. Existing
        notifications stay available.
      </p>
      {!data.data ? (
        data.error ? (
          <Failure error={data.error} retry={data.reload} />
        ) : (
          <Loading />
        )
      ) : (
        <NotificationForm initial={data.data} />
      )}
      <p className="settings-muted">
        These preferences apply only to Inbox. Email delivery is disabled in
        this preview; browser push and quiet hours are not available.
      </p>
    </section>
  );
}
function NotificationForm({ initial }: { initial: Preferences }) {
  const [value, setValue] = useState(initial),
    [saved, setSaved] = useState(initial),
    [remote, setRemote] = useState<Preferences>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [notice, setNotice] = useState("");
  const dirty = (["assignment", "reply", "mention"] as const).some(
    (k) => value[k] !== saved[k],
  );
  async function save() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    setNotice("");
    try {
      const next = await api<Preferences>(
        "/api/me/preferences",
        {
          assignment: value.assignment,
          reply: value.reply,
          mention: value.mention,
          revision: value.revision,
        },
        "PATCH",
      );
      setSaved(next);
      setValue(next);
      setRemote(undefined);
      setNotice("Notification preferences saved.");
    } catch (e) {
      setError(e);
      if (e instanceof ApiError && e.code === "REVISION_CONFLICT") {
        try {
          setRemote(await api<Preferences>("/api/me/preferences"));
        } catch {}
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {(
        [
          ["assignment", "Task assignments", "When a task is assigned to you."],
          [
            "reply",
            "Discussion replies",
            "Replies in topics you started or joined.",
          ],
          [
            "mention",
            "Mentions",
            "When a project teammate mentions you in a discussion.",
          ],
        ] as const
      ).map(([k, title, help]) => (
        <label className="settings-preference-row" key={k}>
          <span>
            <strong>{title}</strong>
            <small>{help}</small>
          </span>
          <input
            type="checkbox"
            checked={value[k]}
            onChange={(e) => {
              setValue({ ...value, [k]: e.target.checked });
              setNotice("");
            }}
          />
        </label>
      ))}
      <InlineError error={error} />
      {remote && (
        <div className="notice">
          <p>
            These preferences changed elsewhere. Your choices are still here.
          </p>
          <button
            type="button"
            onClick={() => {
              setSaved(remote);
              setValue(remote);
              setRemote(undefined);
              setError(undefined);
            }}
          >
            Use latest preferences
          </button>
          <button
            type="button"
            onClick={() => {
              setValue({
                ...value,
                revision: remote.revision,
                updatedAt: remote.updatedAt,
              });
              setSaved(remote);
              setRemote(undefined);
              setError(undefined);
              setNotice("Review your choices, then save again.");
            }}
          >
            Keep my choices for review
          </button>
        </div>
      )}
      <div className="settings-save-row">
        <button
          className="primary"
          disabled={busy || !!remote || (!dirty && !error)}
        >
          {busy
            ? "Saving…"
            : error
              ? "Retry save preferences"
              : "Save preferences"}
        </button>
        <small>
          {dirty
            ? "Unsaved changes"
            : saved.updatedAt
              ? "Saved " + new Date(saved.updatedAt).toLocaleString()
              : "Default preferences"}
        </small>
      </div>
      <p role="status">{notice}</p>
    </form>
  );
}
