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
          <p className="eyebrow">Atlas research · preparation preview</p>
          <h1>Pilot guide & support</h1>
          <p>
            Recruitment has not started. A support owner and pilot teams have
            not been assigned. This preview is not a completed closed-beta
            release.
          </p>
          <div className="notice">
            AI model calls remain disabled.{" "}
            {capabilities.data?.emailDelivery === "disabled"
              ? "Email registration, recovery and invitations are unavailable. "
              : ""}
            Independent backup/recovery acceptance is still open. Keep a
            separate copy of important original research files.
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
            The pilot support channel is not assigned yet. Prepare a short
            report for the product owner: local time, affected screen, expected
            behavior, actual behavior and any displayed request ID. Redact
            research content, names and emails from screenshots.
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
            This preparation adds no analytics SDK or automatic research-content
            collection. Pilot measurements use explicit participant consent and
            a separate observation sheet. Security/audit records remain subject
            to existing access controls. AI histories are private to their
            author; approved text applied into a project document becomes shared
            project content.
          </p>
          <p>
            Original PDFs and in-app versions are not a substitute for an
            independently tested backup. Archiving a project is not permanent
            account erasure. Ask the product owner to agree retention and
            deletion handling before joining a pilot.
          </p>
          <Link href="/settings">Account and active sessions</Link>
        </section>
      )}
    </WorkspaceShell>
  );
}
