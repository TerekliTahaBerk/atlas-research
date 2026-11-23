"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, message } from "@/lib/api";
import { FOUNDING_PROFILES, formatBytes } from "@/lib/pricing";
import type { AiCostReport } from "@/lib/ai-types";

type RecordRow = {
  applicationId?: string;
  id: string;
  name: string;
  email: string;
  institution: string | null;
  researchArea: string;
  applicantType: string;
  motivation: string;
  teamSize: number;
  tools: string[];
  status: string;
  profile: string | null;
  note: string | null;
};
type AdminView = {
  workspaces: Record<string, number>;
  costs: AiCostReport | null;
  planVersion: string;
  founding: {
    applications: RecordRow[];
    profileOccupancy: {
      profile: string;
      capacity: number;
      reserved: number;
      active: number;
    }[];
    grants: {
      workspaceId: string;
      profile: string;
      seats: number;
      endsAt: string;
    }[];
    mailEnabled: boolean;
  };
  academic: {
    actorId: string;
    name: string;
    email: string;
    institutionDomain: string;
    status: string;
    expiresAt: string | null;
    renewalPending: boolean;
  }[];
  storage: {
    storageBytes: number;
    indexedBytes: number;
    pendingIndexJobs: number;
    runningIndexJobs: number;
    failedIndexJobs: number;
  };
  subscriptions: {
    workspaceId: string;
    planCode: string;
    status: string;
    seats: number;
    periodEnd: string;
    provider: string;
  }[];
  auditEvents: { id: string; kind: string; createdAt: string }[];
};
const cost = (micros: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 6,
  }).format(micros / 1_000_000);

export function BillingAdmin() {
  const [data, setData] = useState<AdminView>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [eventLink, setEventLink] = useState("");
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void api<AdminView>(
      "/api/admin/resources",
      undefined,
      "GET",
      controller.signal,
    )
      .then(setData)
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof ApiError && [401, 404].includes(cause.status)
            ? "This page requires an authorized billing operator."
            : message(cause),
        );
      });
    return () => controller.abort();
  }, [revision]);
  async function mutate(path: string, body: object) {
    setPending(true);
    setError("");
    setNotice("");
    setEventLink("");
    try {
      const result = await api<{ link?: string; queued?: boolean }>(
        "/api/admin/resources" + path,
        body,
      );
      setEventLink(result.link ?? "");
      setNotice(result.queued ? "Invitation queued for delivery." : "Saved.");
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setPending(false);
    }
  }
  function foundingReview(
    event: FormEvent<HTMLFormElement>,
    applicationId: string,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const action = String(form.get("action"));
    const note = String(form.get("note") ?? "");
    try {
      const raw = String(form.get("overrides") ?? "").trim();
      const body =
        action === "approve"
          ? {
              profile: form.get("profile"),
              note,
              ...(raw ? { overrides: JSON.parse(raw) } : {}),
            }
          : action === "extend"
            ? { days: Number(form.get("days")), note }
            : action === "invite" || action === "resend"
              ? { send: form.has("send") }
              : { note };
      void mutate("/founding", { action, applicationId, ...body });
    } catch {
      setError(
        "Quota overrides must be a JSON object keyed by catalog resource.",
      );
    }
  }
  function academicReview(event: FormEvent<HTMLFormElement>, actorId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutate("/academic", {
      action: "review",
      actorId,
      decision: form.get("decision"),
      reason: form.get("reason"),
      enrollmentConfirmed: form.has("confirmed"),
    });
  }

  return (
    <div aria-busy={pending || (!data && !error)}>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {eventLink && (
        <label className="resource-invite-link">
          One-time invitation link
          <input
            readOnly
            value={eventLink}
            onFocus={(event) => event.target.select()}
          />
        </label>
      )}
      {!data && !error && <p role="status">Loading resources…</p>}
      {data && (
        <>
          <section className="founding-panel">
            <h2>Plan catalog</h2>
            <p>Version {data.planVersion}</p>
            <dl className="resource-admin-totals">
              {["free", "subscription", "founding"].map((kind) => (
                <div key={kind}>
                  <dt>{kind}</dt>
                  <dd>{data.workspaces[kind] ?? 0}</dd>
                </div>
              ))}
            </dl>
          </section>
          {data.costs && (
            <section className="founding-panel">
              <h2>AI providers</h2>
              <p>
                Founding budget {cost(data.costs.founding.capMicros)} · Actual{" "}
                {cost(data.costs.founding.actualMicros)} · Reserved{" "}
                {cost(data.costs.founding.heldMicros)} · Uncertain{" "}
                {cost(data.costs.founding.uncertainMicros)}
              </p>
              {data.costs.founding.warning && (
                <p role="status">
                  Founding AI spend and outstanding reservations reached the 80%
                  threshold.
                </p>
              )}
              {!data.costs.founding.allowed && (
                <p role="status">New founding AI reservations are blocked.</p>
              )}
              <ul>
                {data.costs.models.map((row) => (
                  <li key={row.provider + row.model + row.pricingVersion}>
                    {row.model} · {row.runs} runs · {cost(row.actualMicros)}{" "}
                    provider spend · {row.credits} credits
                  </li>
                ))}
              </ul>
              <details>
                <summary>Highest-cost runs</summary>
                <ul>
                  {data.costs.highCostRuns.map((run) => (
                    <li key={run.id}>
                      {run.model} · {cost(run.actualMicros)} · {run.costState}
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          )}
          <section className="founding-panel">
            <h2>Founding Access</h2>
            <ul>
              {data.founding.profileOccupancy.map((row) => (
                <li key={row.profile}>
                  {row.profile.replace("RES_FOUNDING_", "")} · {row.active}{" "}
                  active, {row.reserved} reserved, {row.capacity} places
                </li>
              ))}
            </ul>
            <h3>Applications</h3>
            {data.founding.applications.length === 0 && (
              <p>No applications yet.</p>
            )}
            {data.founding.applications.map((row) => (
              <details key={row.id}>
                <summary>
                  {row.name} · {row.status}
                </summary>
                <p>
                  {row.email} · {row.institution ?? "Independent"} ·{" "}
                  {row.researchArea} · {row.applicantType} · {row.teamSize}{" "}
                  researchers
                </p>
                <p>
                  {row.tools.join(", ")} · {row.motivation}
                </p>
                {row.note && <p>{row.note}</p>}
                <form
                  className="founding-form"
                  onSubmit={(event) => foundingReview(event, row.id)}
                >
                  <label>
                    Action
                    <select name="action" defaultValue="approve">
                      {[
                        "approve",
                        "reject",
                        "note",
                        "invite",
                        "resend",
                        "expire",
                        "extend",
                        "revoke",
                      ].map((action) => (
                        <option key={action} value={action}>
                          {action}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Profile
                    <select
                      name="profile"
                      defaultValue={row.profile ?? "RES_FOUNDING_RESEARCHER"}
                    >
                      {Object.entries(FOUNDING_PROFILES).map(
                        ([id, profile]) => (
                          <option key={id} value={id}>
                            {profile.label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    Notes or reason
                    <textarea name="note" maxLength={500} rows={2} />
                  </label>
                  <label>
                    Optional quota overrides
                    <textarea
                      name="overrides"
                      rows={2}
                      placeholder='{"monthlyAiCredits":100}'
                    />
                  </label>
                  <label>
                    Extension days
                    <input
                      name="days"
                      type="number"
                      min={1}
                      max={30}
                      defaultValue={1}
                    />
                  </label>
                  {data.founding.mailEnabled && (
                    <label>
                      <span>
                        <input name="send" type="checkbox" /> Queue an
                        invitation email
                      </span>
                    </label>
                  )}
                  <button
                    className="public-button public-primary"
                    type="submit"
                    disabled={pending}
                  >
                    Apply review action
                  </button>
                </form>
              </details>
            ))}
          </section>
          <section className="founding-panel">
            <h2>Academic eligibility</h2>
            <details>
              <summary>Record an accredited institution</summary>
              <form
                className="founding-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void mutate("/academic", {
                    action: "institution",
                    domain: form.get("domain"),
                    name: form.get("name"),
                    verificationUrl: form.get("verificationUrl"),
                    active: form.has("active"),
                  });
                }}
              >
                <label>
                  Institution name
                  <input name="name" required />
                </label>
                <label>
                  Institution email domain
                  <input name="domain" required />
                </label>
                <label>
                  Official verification URL
                  <input name="verificationUrl" type="url" required />
                </label>
                <label>
                  <span>
                    <input name="active" type="checkbox" defaultChecked />{" "}
                    Institution verified
                  </span>
                </label>
                <button
                  className="public-button public-primary"
                  type="submit"
                  disabled={pending}
                >
                  Save institution
                </button>
              </form>
            </details>
            {data.academic.map((row) => (
              <details key={row.actorId}>
                <summary>
                  {row.name} · {row.institutionDomain} ·{" "}
                  {row.renewalPending ? "renewal requested" : row.status}
                </summary>
                <p>
                  {row.email}
                  {row.expiresAt
                    ? " · Expires " + row.expiresAt.slice(0, 10)
                    : ""}
                </p>
                <form
                  className="founding-form"
                  onSubmit={(event) => academicReview(event, row.actorId)}
                >
                  <label>
                    Decision
                    <select name="decision">
                      <option value="verify">Verify</option>
                      <option value="reject">Reject</option>
                    </select>
                  </label>
                  <label>
                    Review reason
                    <input
                      name="reason"
                      required
                      minLength={6}
                      maxLength={500}
                    />
                  </label>
                  <label>
                    <span>
                      <input type="checkbox" name="confirmed" /> Current student
                      enrollment independently checked
                    </span>
                  </label>
                  <button
                    className="public-button public-primary"
                    type="submit"
                    disabled={pending}
                  >
                    Record decision
                  </button>
                </form>
              </details>
            ))}
          </section>
          <section className="founding-panel">
            <h2>Files and indexing</h2>
            <p>
              {formatBytes(data.storage.storageBytes)} stored ·{" "}
              {formatBytes(data.storage.indexedBytes)} indexed
            </p>
            <p>
              Index jobs · {data.storage.pendingIndexJobs} queued ·{" "}
              {data.storage.runningIndexJobs} running ·{" "}
              {data.storage.failedIndexJobs} failed
            </p>
            <p>Python and native LaTeX execution are unavailable.</p>
          </section>
          <section className="founding-panel">
            <h2>Subscriptions and seats</h2>
            <ul>
              {data.subscriptions.map((row) => (
                <li key={row.workspaceId}>
                  {row.planCode} · {row.status} · {row.seats} seats · through{" "}
                  {row.periodEnd.slice(0, 10)} · {row.provider}
                </li>
              ))}
            </ul>
            {data.subscriptions.length === 0 && (
              <p>No subscriptions recorded.</p>
            )}
            <p>Checkout and external payment processing are unavailable.</p>
            <details>
              <summary>Grant AI credits to a workspace</summary>
              <form
                className="founding-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void mutate("", {
                    action: "credit",
                    workspaceId: form.get("workspaceId"),
                    quantity: Number(form.get("quantity")),
                    validityDays: Number(form.get("validityDays")),
                    reason: form.get("reason"),
                    requestId: crypto.randomUUID(),
                  });
                }}
              >
                <label>
                  Workspace ID
                  <input name="workspaceId" required />
                </label>
                <label>
                  Credits
                  <input
                    name="quantity"
                    type="number"
                    min={1}
                    max={10000}
                    required
                  />
                </label>
                <label>
                  Validity in days
                  <input
                    name="validityDays"
                    type="number"
                    min={1}
                    max={365}
                    defaultValue={30}
                    required
                  />
                </label>
                <label>
                  Adjustment reason
                  <input name="reason" required minLength={6} maxLength={500} />
                </label>
                <button
                  className="public-button public-primary"
                  type="submit"
                  disabled={pending}
                >
                  Record credit adjustment
                </button>
              </form>
            </details>
          </section>
          <section className="founding-panel">
            <h2>Audit log</h2>
            <ul>
              {data.auditEvents.map((row) => (
                <li key={row.id}>
                  {row.createdAt.slice(0, 10)} · {row.kind.replaceAll("_", " ")}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
