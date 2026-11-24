"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError, message } from "@/lib/api";
import {
  COMPUTE_MAX_SOURCE_BYTES,
  COMPUTE_MIN_TIMEOUT_MS,
  type ComputeJobView,
  type ComputeKind,
  type ComputeOverview,
  type ComputeStatus,
} from "@/lib/compute-types";
import { Failure, Loading, useResource } from "./ui";
import { WorkspaceShell } from "./workspace-shell";
import "./compute-screen.css";

const modes = {
  python: {
    title: "Python",
    submit: "Run Python",
    example:
      "values = [4, 7, 9, 10]\nprint(f'Mean: {sum(values) / len(values):.2f}')\n",
  },
  latex: {
    title: "LaTeX",
    submit: "Compile LaTeX",
    example: String.raw`\documentclass{article}
\begin{document}
\section{Research notes}
The sample mean is $\bar{x} = \frac{1}{n}\sum_{i=1}^{n}x_i$.
\end{document}
`,
  },
};
const statuses: Record<ComputeStatus, string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Completed",
  failed: "Failed",
  timed_out: "Timed out",
  canceled: "Canceled",
  abandoned: "Interrupted",
  output_limit: "Output limit reached",
};
const explanations: Partial<Record<ComputeStatus, string>> = {
  queued: "Waiting for an isolated runner.",
  running: "The job is running in an isolated environment.",
  timed_out:
    "The job reached its runtime limit. Try a smaller job or increase the limit if capacity allows.",
  canceled: "The job was canceled.",
  abandoned: "The runner did not finish the job. You can submit a new run.",
  output_limit:
    "The job exceeded the allowed output. Reduce the amount it prints before trying again.",
  failed:
    "The job did not complete successfully. Review the output for details.",
};
const duration = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });
const counts = new Intl.NumberFormat("en-US");
const time = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
const encoder = new TextEncoder();

function pending(job: ComputeJobView) {
  return job.status === "queued" || job.status === "running";
}

function statusText(job: ComputeJobView) {
  return pending(job) && job.cancelRequested
    ? "Cancel requested"
    : statuses[job.status];
}

function elapsed(milliseconds: number) {
  if (milliseconds < 60_000)
    return `${duration.format(milliseconds / 1_000)} s`;
  return `${duration.format(milliseconds / 60_000)} min`;
}

function failureText(error: unknown) {
  switch (error instanceof ApiError ? error.code : "") {
    case "COMPUTE_UNAVAILABLE":
      return "The compute runner is unavailable. Your code is still here.";
    case "RESOURCE_QUOTA":
      return "This workspace has insufficient compute capacity for the requested job.";
    case "CONFLICT":
      return "A compute job is in progress or this request was already used. Refresh the jobs before trying again.";
    default:
      return message(error);
  }
}

export function ComputeScreen({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}) {
  return (
    <WorkspaceShell title="Compute" surface="compute">
      {({ projects, me, reload }) => {
        const project = projects.find(
          (item) => item.workspaceId === workspaceId && item.id === projectId,
        );
        if (!project) return <Failure error={null} retry={reload} />;
        return (
          <ComputeBody
            key={`${me.user.id}/${workspaceId}/${projectId}`}
            workspaceId={workspaceId}
            projectId={projectId}
            projectName={project.name}
          />
        );
      }}
    </WorkspaceShell>
  );
}

function JobOutput({
  job,
  pdfUrl,
  onCancel,
  canceling,
}: {
  job: ComputeJobView;
  pdfUrl: string;
  onCancel?: () => void;
  canceling: boolean;
}) {
  return (
    <section
      className="compute-card compute-result"
      aria-labelledby="compute-output"
    >
      <header>
        <div>
          <h2 id="compute-output">{modes[job.kind].title} output</h2>
          <time dateTime={job.createdAt}>
            {time.format(new Date(job.createdAt))} UTC
          </time>
        </div>
        {onCancel && pending(job) && !job.cancelRequested ? (
          <button type="button" disabled={canceling} onClick={onCancel}>
            {canceling ? "Canceling…" : "Cancel job"}
          </button>
        ) : null}
      </header>
      <div className="compute-status-row">
        <span
          className="compute-job-status"
          data-status={job.status}
          role="status"
        >
          {statusText(job)}
        </span>
        <span>Limit {elapsed(job.timeoutMs)}</span>
        {job.elapsedMs !== null ? (
          <span>Elapsed {elapsed(job.elapsedMs)}</span>
        ) : null}
      </div>
      {explanations[job.status] ? <p>{explanations[job.status]}</p> : null}
      {job.hasPdf && job.status === "succeeded" ? (
        <a className="button" href={pdfUrl} download>
          Download PDF
        </a>
      ) : null}
      {job.stdout ? (
        <div className="compute-stream">
          <h3>Output</h3>
          <pre tabIndex={0} aria-label="Standard output">
            {job.stdout}
          </pre>
        </div>
      ) : null}
      {job.stderr ? (
        <div className="compute-stream">
          <h3>{job.kind === "latex" ? "Compiler log" : "Standard error"}</h3>
          <pre
            tabIndex={0}
            aria-label={
              job.kind === "latex" ? "Compiler log" : "Standard error"
            }
          >
            {job.stderr}
          </pre>
        </div>
      ) : null}
      {job.status === "succeeded" &&
      !job.stdout &&
      !job.stderr &&
      !job.hasPdf ? (
        <p>
          No output is available for this job. Results expire after 24 hours.
        </p>
      ) : null}
    </section>
  );
}

type Submission = {
  requestId: string;
  kind: ComputeKind;
  source: string;
  timeoutMs: number;
};

function ComputeBody({
  workspaceId,
  projectId,
  projectName,
}: {
  workspaceId: string;
  projectId: string;
  projectName: string;
}) {
  const scope = new URLSearchParams({ workspaceId, projectId }).toString();
  const overview = useResource<ComputeOverview>(
    `/api/compute?${scope}`,
    false,
    true,
  );
  const reload = overview.reload;
  const [kind, setKind] = useState<ComputeKind>("python");
  const [drafts, setDrafts] = useState({
    python: modes.python.example,
    latex: modes.latex.example,
  });
  const [seconds, setSeconds] = useState("");
  const [selectedId, selectJob] = useState<string>();
  const [latestJob, setLatestJob] = useState<ComputeJobView>();
  const [error, setError] = useState<unknown>();
  const [pollError, setPollError] = useState<unknown>();
  const [submitting, setSubmitting] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const submission = useRef<Submission>(undefined);
  const submittingRef = useRef(false);
  const data = overview.data;
  const stored = data?.jobs ?? [];
  const recent = latestJob && stored.find((item) => item.id === latestJob.id);
  const current = recent && !pending(recent) ? recent : latestJob;
  const jobs = current
    ? [current, ...stored.filter((item) => item.id !== current.id)]
    : stored;
  const selectedJob = jobs.find((item) => item.id === selectedId) ?? jobs[0];
  const needsDetail = selectedJob && !pending(selectedJob);
  const result = useResource<ComputeJobView>(
    needsDetail ? `/api/compute/${selectedJob.id}?${scope}` : null,
  );
  const job = needsDetail ? result.data : selectedJob;
  const pendingId = jobs.find(pending)?.id;

  useEffect(() => {
    if (!pendingId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function refresh() {
      try {
        const updated = await api<ComputeJobView>(
          `/api/compute/${pendingId}?${scope}`,
          undefined,
          "GET",
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setPollError(undefined);
        setLatestJob((previous) =>
          previous?.id === updated.id &&
          previous.cancelRequested &&
          pending(updated)
            ? { ...updated, cancelRequested: true }
            : updated,
        );
        if (!pending(updated)) {
          reload();
          return;
        }
        timer = setTimeout(() => void refresh(), 1_200);
      } catch (problem) {
        if (controller.signal.aborted) return;
        setPollError(problem);
        if (
          problem instanceof ApiError &&
          [401, 403, 404].includes(problem.status)
        ) {
          setLatestJob((previous) =>
            previous?.id === pendingId ? undefined : previous,
          );
          reload();
          return;
        }
        timer = setTimeout(() => void refresh(), 3_000);
      }
    }

    timer = setTimeout(() => void refresh(), 700);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [scope, pendingId, reload]);

  if (!data && overview.error)
    return <Failure error={overview.error} retry={reload} />;
  if (!data) return <Loading />;

  const { limits } = data;
  const source = drafts[kind];
  const sourceBytes = encoder.encode(source).length;
  const invalidSource =
    sourceBytes > COMPUTE_MAX_SOURCE_BYTES || source.includes("\0");
  const maxPythonMs = Math.min(
    limits.pythonRemainingMs,
    limits.pythonTimeoutMs,
  );
  const defaultTimeout = Math.min(10_000, maxPythonMs);
  const timeoutMs =
    kind === "latex"
      ? limits.latexTimeoutMs
      : seconds === ""
        ? defaultTimeout
        : Math.round(Number(seconds) * 1_000);
  const timeoutAllowed =
    timeoutMs >= COMPUTE_MIN_TIMEOUT_MS &&
    (kind === "latex" || timeoutMs <= maxPythonMs);
  const canSend =
    data.available &&
    data.canRun &&
    !submitting &&
    !pendingId &&
    !overview.error &&
    !!source.trim() &&
    !invalidSource &&
    timeoutAllowed &&
    (kind === "python" || limits.latexRemaining > 0);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend || submittingRef.current) return;
    submittingRef.current = true;
    setError(undefined);
    setPollError(undefined);
    setSubmitting(true);
    const previous = submission.current;
    const requestId =
      previous?.kind === kind &&
      previous.source === source &&
      previous.timeoutMs === timeoutMs
        ? previous.requestId
        : crypto.randomUUID();
    submission.current = { requestId, kind, source, timeoutMs };
    try {
      const created = await api<ComputeJobView>("/api/compute", {
        workspaceId,
        projectId,
        requestId,
        kind,
        source,
        timeoutMs,
      });
      submission.current = undefined;
      setLatestJob(created);
      selectJob(created.id);
      reload();
    } catch (problem) {
      setError(problem);
      reload();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function cancel(target: ComputeJobView) {
    if (canceling) return;
    setError(undefined);
    setCanceling(true);
    try {
      const updated = await api<ComputeJobView>(
        `/api/compute/${target.id}?${scope}`,
        undefined,
        "DELETE",
      );
      setLatestJob((previous) =>
        previous?.id === updated.id && !pending(previous) && pending(updated)
          ? previous
          : updated,
      );
      reload();
    } catch (problem) {
      setError(problem);
      reload();
    } finally {
      setCanceling(false);
    }
  }

  let cost: string;
  if (pendingId)
    cost = "Wait for the active job to finish before submitting again.";
  else if (sourceBytes > COMPUTE_MAX_SOURCE_BYTES)
    cost = "Reduce the source size before submitting.";
  else if (source.includes("\0"))
    cost = "Remove null characters from the source.";
  else if (kind === "latex")
    cost =
      limits.latexRemaining > 0
        ? "Reserves one compile."
        : "No LaTeX compilations remain.";
  else if (maxPythonMs < COMPUTE_MIN_TIMEOUT_MS)
    cost = "No Python time remains for a new job.";
  else if (!timeoutAllowed)
    cost = `Enter a runtime from ${elapsed(COMPUTE_MIN_TIMEOUT_MS)} to ${elapsed(maxPythonMs)}.`;
  else cost = `Reserves up to ${elapsed(timeoutMs)} of Python time.`;

  return (
    <div className="compute-page">
      <header className="compute-heading">
        <div>
          <small>{projectName}</small>
          <h1>Compute</h1>
        </div>
        <Link href={`/w/${encodeURIComponent(workspaceId)}/usage`}>
          Workspace usage
        </Link>
      </header>
      {!data.available || overview.error ? (
        <div className="compute-unavailable" role="status">
          <strong>Compute is unavailable.</strong>
          <p>
            The runner is not ready to accept jobs. Existing results remain
            visible below.
          </p>
          <button type="button" onClick={reload}>
            Check again
          </button>
        </div>
      ) : !data.canRun ? (
        <p className="notice" role="status">
          This project is read only for your account. Existing results remain
          available.
        </p>
      ) : null}
      <dl className="compute-limits" aria-label="Workspace compute balance">
        <div>
          <dt>Python remaining</dt>
          <dd>{elapsed(limits.pythonRemainingMs)}</dd>
        </div>
        <div>
          <dt>Python run limit</dt>
          <dd>{elapsed(limits.pythonTimeoutMs)}</dd>
        </div>
        <div>
          <dt>LaTeX remaining</dt>
          <dd>{counts.format(limits.latexRemaining)} compiles</dd>
        </div>
        <div>
          <dt>LaTeX run limit</dt>
          <dd>{elapsed(limits.latexTimeoutMs)}</dd>
        </div>
      </dl>
      {error ? (
        <p className="compute-error" role="alert">
          {failureText(error)}
        </p>
      ) : null}
      {pollError ? (
        <p className="compute-error" role="alert">
          Job status could not be refreshed. {failureText(pollError)}
        </p>
      ) : null}
      <div className="compute-layout" data-editable={data.canRun}>
        {data.canRun ? (
          <section className="compute-card" aria-labelledby="compute-editor">
            <header>
              <div>
                <h2 id="compute-editor">Source</h2>
                <p>Only the code below is sent to the runner.</p>
              </div>
              <div
                className="compute-switch"
                role="group"
                aria-label="Compute language"
              >
                {(Object.keys(modes) as ComputeKind[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={mode === kind}
                    onClick={() => {
                      setKind(mode);
                      setError(undefined);
                    }}
                  >
                    {modes[mode].title}
                  </button>
                ))}
              </div>
            </header>
            <form onSubmit={(event) => void start(event)}>
              <div className="compute-source-label">
                <label htmlFor="compute-source">
                  {modes[kind].title} source
                </label>
                <small id="compute-source-size">
                  {counts.format(sourceBytes)} /{" "}
                  {counts.format(COMPUTE_MAX_SOURCE_BYTES)} bytes
                </small>
              </div>
              <textarea
                id="compute-source"
                name="source"
                rows={12}
                value={source}
                required
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                translate="no"
                aria-invalid={invalidSource || undefined}
                aria-describedby="compute-source-size"
                onChange={(event) =>
                  setDrafts((previous) => ({
                    ...previous,
                    [kind]: event.target.value,
                  }))
                }
              />
              <div className="compute-submit">
                {kind === "python" ? (
                  <label>
                    Runtime limit (seconds)
                    <input
                      type="number"
                      min={COMPUTE_MIN_TIMEOUT_MS / 1_000}
                      step={0.001}
                      max={maxPythonMs > 0 ? maxPythonMs / 1_000 : undefined}
                      value={seconds}
                      placeholder={String(defaultTimeout / 1_000)}
                      disabled={maxPythonMs < COMPUTE_MIN_TIMEOUT_MS}
                      aria-invalid={
                        (maxPythonMs > 0 && !timeoutAllowed) || undefined
                      }
                      onChange={(event) => setSeconds(event.target.value)}
                    />
                  </label>
                ) : null}
                <button className="primary" type="submit" disabled={!canSend}>
                  {submitting ? "Submitting…" : modes[kind].submit}
                </button>
              </div>
              <p className="compute-hint">{cost}</p>
            </form>
          </section>
        ) : null}
        {job ? (
          <JobOutput
            job={job}
            pdfUrl={`/api/compute/${job.id}/pdf?${scope}`}
            onCancel={() => void cancel(job)}
            canceling={canceling}
          />
        ) : (
          <section
            className="compute-card compute-empty"
            aria-labelledby="compute-output"
          >
            <h2 id="compute-output">Output</h2>
            {result.error ? (
              <>
                <p role="alert">{failureText(result.error)}</p>
                <button type="button" onClick={result.reload}>
                  Retry loading output
                </button>
              </>
            ) : needsDetail ? (
              <p role="status">Loading job output…</p>
            ) : (
              <p>
                {data.canRun
                  ? "Run Python to see output or compile LaTeX to create a PDF."
                  : "No output is available for this project."}
              </p>
            )}
          </section>
        )}
      </div>
      <section className="compute-recent" aria-labelledby="compute-history">
        <h2 id="compute-history">Recent jobs</h2>
        {jobs.length ? (
          <ul>
            {jobs.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={item.id === selectedJob?.id}
                  onClick={() => {
                    selectJob(item.id);
                    setPollError(undefined);
                  }}
                >
                  <strong>{modes[item.kind].title}</strong>
                  <time dateTime={item.createdAt}>
                    {time.format(new Date(item.createdAt))} UTC
                  </time>
                  <span
                    className="compute-job-status"
                    data-status={item.status}
                  >
                    {statusText(item)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>No compute jobs for this project yet.</p>
        )}
      </section>
    </div>
  );
}
