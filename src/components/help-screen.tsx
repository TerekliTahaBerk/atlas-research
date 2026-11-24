"use client";
import { useState } from "react";
import Link from "next/link";
import { WorkspaceShell } from "./workspace-shell";
import { api } from "@/lib/api";
import { InlineError, useResource } from "./ui";
export function HelpScreen() {
  const capabilities = useResource<{ emailDelivery: string }>(
      "/api/capabilities",
    ),
    [diagnostic, setDiagnostic] = useState(""),
    [error, setError] = useState<unknown>();
  return (
    <WorkspaceShell title="Pilot guide">
      {() => (
        <section className="pilot-guide">
          <h1>Pilot guide & support</h1>
          <p>
            Email your pilot coordinator using the address in your welcome
            instructions. Start with a sample you are allowed to share and can
            replace.
          </p>
          <div className="notice">
            AI model calls remain disabled.{" "}
            {capabilities.data?.emailDelivery === "disabled"
              ? "Email registration, recovery and invitations are unavailable. "
              : ""}
            Keep your own copy of original research files.
          </div>
          <h2>Your connected research workflow</h2>
          <ol>
            <li>
              Create or choose a project. Check the project name before adding
              private material.
            </li>
            <li>
              Add a DOI or upload a PDF you are permitted to store. Metadata
              alone is not full-text evidence.
            </li>
            <li>Read a specific PDF version and save a note or highlight.</li>
            <li>
              Use “Write from this” to draft a document with its stable source
              citation. Wait for “Saved”. Export Markdown for a portable copy.
            </li>
            <li>
              Create a linked task or discussion. Only authorized project
              members can access it.
            </li>
            <li>
              Ask Atlas can prepare evidence previews. Model answers require
              separate activation, a chosen budget and explicit per-question
              sharing approval.
            </li>
          </ol>
          <h2>If something goes wrong</h2>
          <ul>
            <li>
              For a saving conflict, preserve your draft and review the server
              version. Do not overwrite another editor’s changes.
            </li>
            <li>
              If access is revoked, stop using cached content and contact the
              workspace owner through your existing agreed channel.
            </li>
            <li>
              For suspected data exposure or loss, stop the affected workflow
              and notify the product owner privately. Do not paste research,
              credentials or private URLs into public issues.
            </li>
          </ul>
          <h2>Report a problem safely</h2>
          <p>
            Include the time, affected screen, what you expected, what happened
            and any displayed request ID. Remove research content, names and
            emails from screenshots before sharing them privately.
          </p>
          <button
            onClick={async () => {
              setError(undefined);
              try {
                const r = await api<{
                  status: string;
                  release: string;
                  schema?: string;
                }>("/health/ready");
                setDiagnostic(
                  `Atlas readiness: ${r.status}\nRelease: ${r.release}\nSchema: ${r.schema ?? "unavailable"}\nObserved: ${new Date().toISOString()}`,
                );
              } catch (e) {
                setError(e);
              }
            }}
          >
            Prepare safe diagnostics
          </button>
          {diagnostic && (
            <label>
              Technical details — no research or account data
              <textarea readOnly rows={5} value={diagnostic} />
            </label>
          )}
          <InlineError error={error} />
          <h2>Privacy & limitations</h2>
          <p>
            Pilot observations require participant consent and use a separate
            observation sheet. AI histories are private to their author. Text
            added to a project document is visible to its authorized members.
          </p>
          <p>
            Archiving preserves a project for later access. For questions about
            retention, export or deletion, contact your pilot coordinator.
          </p>
          <Link href="/settings">Account and active sessions</Link>
        </section>
      )}
    </WorkspaceShell>
  );
}
