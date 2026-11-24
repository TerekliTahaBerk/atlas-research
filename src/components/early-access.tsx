"use client";
import Link from "next/link";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { api, ApiError, message } from "@/lib/api";

export function EarlyAccessApplication() {
  const [status, setStatus] = useState<"editing" | "sending" | "submitted">(
    "editing",
  );
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setStatus("sending");
    setError("");
    try {
      await api("/api/early-access", {
        name: fields.get("name"),
        email: fields.get("email"),
        institution: fields.get("institution"),
        researchArea: fields.get("researchArea"),
        applicantType: fields.get("applicantType"),
        teamSize: Number(fields.get("teamSize")),
        tools: fields.getAll("tools"),
        motivation: fields.get("motivation"),
      });
      setStatus("submitted");
    } catch (cause) {
      setError(message(cause));
      setStatus("editing");
    }
  }
  return (
    <section className="founding-panel">
      <h2>Apply for early access</h2>
      {status === "submitted" ? (
        <p role="status">
          We received your application. Approved applicants receive an
          invitation separately.
        </p>
      ) : (
        <form className="founding-form" onSubmit={submit}>
          <label>
            Full name
            <input
              name="name"
              autoComplete="name"
              required
              minLength={2}
              maxLength={120}
            />
          </label>
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
            />
          </label>
          <label>
            University or institution (optional)
            <input
              name="institution"
              autoComplete="organization"
              maxLength={160}
            />
          </label>
          <label>
            Research area
            <input name="researchArea" required minLength={2} maxLength={160} />
          </label>
          <label>
            Research profile
            <select name="applicantType" required defaultValue="">
              <option value="" disabled>
                Select a profile
              </option>
              <option value="undergraduate">Undergraduate</option>
              <option value="masters">Master’s student</option>
              <option value="doctorate">Doctoral student</option>
              <option value="academic">Academic</option>
              <option value="independent">Independent researcher</option>
              <option value="team">Research team</option>
              <option value="lab">Lab</option>
            </select>
          </label>
          <label>
            Expected team size
            <input
              name="teamSize"
              type="number"
              min={1}
              max={1000}
              defaultValue={1}
              required
            />
          </label>
          <fieldset>
            <legend>Tools you plan to use</legend>
            {["PDF", "AI", "Python", "LaTeX"].map((tool) => (
              <label key={tool}>
                <input
                  type="checkbox"
                  name="tools"
                  value={tool.toLowerCase()}
                />
                {tool}
              </label>
            ))}
          </fieldset>
          <label>
            How would you use Atlas in your pilot?
            <textarea
              name="motivation"
              rows={4}
              required
              minLength={15}
              maxLength={1600}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <button
            className="public-button public-primary"
            type="submit"
            disabled={status === "sending"}
          >
            {status === "sending" ? "Submitting…" : "Submit application"}
          </button>
        </form>
      )}
    </section>
  );
}

type Workspace = {
  id: string;
  kind: string;
  name: string;
  archivedAt: string | null;
};
function watchInvitationLocation(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}
function currentInvitationToken() {
  const key = new URLSearchParams(window.location.hash.slice(1)).get("token");
  return key && /^[a-f0-9]{64}$/.test(key) ? key : "";
}

export function EarlyAccessActivation() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>();
  const token = useSyncExternalStore(
    watchInvitationLocation,
    currentInvitationToken,
    () => "",
  );
  const [error, setError] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void api<Workspace[]>(
      "/api/workspaces",
      undefined,
      "GET",
      controller.signal,
    )
      .then((rows) => setWorkspaces(rows.filter((row) => !row.archivedAt)))
      .catch((cause) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiError && cause.status === 401)
          setNeedsSignIn(true);
        else setError(message(cause));
      });
    return () => controller.abort();
  }, []);

  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const workspaceId = String(
      new FormData(event.currentTarget).get("workspaceId") ?? "",
    );
    setLoading(true);
    setError("");
    try {
      await api("/api/early-access/activate", { workspaceId, token });
      history.replaceState(null, "", window.location.pathname);
      setActiveWorkspace(workspaceId);
    } catch {
      setError(
        "This invitation could not be activated. Check the invited email, workspace type and expiration.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="founding-panel">
      {activeWorkspace ? (
        <div role="status">
          <h2>Founding Access active</h2>
          <Link href={`/w/${activeWorkspace}/usage`}>View your resources</Link>
        </div>
      ) : needsSignIn ? (
        <>
          <h2>Sign in first</h2>
          <p>
            <Link href="/sign-in" target="_blank" rel="noreferrer">
              Sign in
            </Link>{" "}
            with the invited email, then refresh this page.
          </p>
        </>
      ) : (
        <form className="founding-form" onSubmit={activate}>
          <label>
            Workspace
            <select name="workspaceId" required disabled={!workspaces?.length}>
              {workspaces?.map((row) => (
                <option value={row.id} key={row.id}>
                  {row.name} · {row.kind}
                </option>
              ))}
            </select>
          </label>
          {!token && <p>The invitation link is required.</p>}
          {workspaces?.length === 0 && (
            <p>
              <Link href="/onboarding">Create a workspace</Link> to redeem the
              invitation.
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <button
            type="submit"
            className="public-button public-primary"
            disabled={!token || !workspaces?.length || loading}
          >
            {loading ? "Activating…" : "Activate"}
          </button>
        </form>
      )}
    </section>
  );
}
