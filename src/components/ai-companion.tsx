"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import type {
  AiContextView,
  AiConversationView,
  AiPolicyView,
  AiVersion,
  EvidenceView,
} from "@/lib/ai-types";
import type { DocNode } from "@/lib/document-model";
import { Icon, InlineError, Loading, Modal, useResource } from "./ui";
const dollars = (n: number) => `$${(n / 1000000).toFixed(4)}`;
type Options = {
  versions: AiVersion[];
  policy: AiPolicyView;
  conversations: { id: string; title: string; versionIds: string[] }[];
  canEdit: boolean;
};
type Seed = { w: string; p: string; sourceId?: string; versionId?: string };
export function AiCompanion({
  w,
  p,
  userId,
  projectName,
}: {
  w: string;
  p: string;
  userId: string;
  projectName: string;
}) {
  const key = `atlas-ai-v1:${userId}:${w}:${p}`;
  const saved = () => {
    try {
      return sessionStorage.getItem("atlas-ai-active-project") === key
        ? JSON.parse(sessionStorage.getItem(key) ?? "{}")
        : {};
    } catch {
      return {};
    }
  };
  const [open, setOpen] = useState(() => saved().open === true),
    [conversation, setConversation] = useState<string>(() => saved().id ?? ""),
    [seed, setSeed] = useState<Seed>(),
    [wide, setWide] = useState(() => matchMedia("(min-width:1200px)").matches),
    [target, setTarget] = useState<HTMLElement | null>(null);
  const mount = useCallback((node: HTMLSpanElement | null) => {
    if (node) setTarget(document.getElementById("atlas-ai-toggle"));
  }, []);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const media = matchMedia("(min-width:1200px)");
    const sync = () => setWide(media.matches);
    media.addEventListener("change", sync);
    try {
      sessionStorage.setItem("atlas-ai-active-project", key);
    } catch {}
    const launch = (event: Event) => {
      const data = (event as CustomEvent<Seed>).detail;
      if (data.w !== w || data.p !== p) return;
      setSeed(data);
      setConversation("");
      setOpen(true);
      try {
        sessionStorage.setItem(key, JSON.stringify({ open: true, id: "" }));
      } catch {}
    };
    window.addEventListener("atlas-ai-open", launch);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("atlas-ai-open", launch);
    };
  }, [key, w, p]);
  function changeOpen(value: boolean) {
    setOpen(value);
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({ open: value, id: conversation }),
      );
    } catch {}
    if (!value) trigger.current?.focus();
  }
  function choose(id: string) {
    setConversation(id);
    try {
      sessionStorage.setItem(key, JSON.stringify({ open: true, id }));
    } catch {}
  }
  const panel = open ? (
    <AiPanel
      key={key}
      w={w}
      p={p}
      conversation={conversation}
      choose={choose}
      seed={seed}
      projectName={projectName}
    />
  ) : null;
  return (
    <>
      <span hidden ref={mount} />
      {target &&
        createPortal(
          <button
            ref={trigger}
            className="ai-toggle"
            aria-expanded={open}
            aria-label="Ask Atlas"
            onClick={() => changeOpen(!open)}
          >
            <Icon name="sparkles" />
            <span>Ask Atlas</span>
          </button>,
          target,
        )}
      {open &&
        (wide ? (
          <aside
            className="ai-panel"
            aria-label="Ask Atlas"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                changeOpen(false);
              }
            }}
          >
            <div className="ai-heading">
              <strong>
                <Icon name="sparkles" /> Ask Atlas
              </strong>
              <button
                className="icon-button"
                aria-label="Close Ask Atlas"
                onClick={() => changeOpen(false)}
              >
                <Icon name="close" />
              </button>
            </div>
            {panel}
          </aside>
        ) : (
          <Modal title="Ask Atlas" onClose={() => changeOpen(false)}>
            {panel}
          </Modal>
        ))}
    </>
  );
}
function Evidence({ items }: { items: EvidenceView[] }) {
  return (
    <div className="ai-evidence">
      {items.map((e, i) => (
        <details key={e.id}>
          <summary>
            <span>
              {i + 1}. {e.title} · p. {e.page}
            </span>
          </summary>
          <blockquote>{e.quote}</blockquote>
          <Link className="ai-citation" href={e.href}>
            Open exact version · page {e.page}
          </Link>
          <small>
            Verified locator · characters {e.start}–{e.end}
          </small>
          <small className="ai-hash">
            PDF SHA-256 {e.fileSha256}
            <br />
            Quote SHA-256 {e.quoteHash}
            <br />
            {e.extractor}
          </small>
        </details>
      ))}
    </div>
  );
}
function AiPanel({
  w,
  p,
  conversation,
  choose,
  seed,
  projectName,
}: {
  w: string;
  p: string;
  conversation: string;
  choose: (id: string) => void;
  seed?: Seed;
  projectName: string;
}) {
  const base = `/api/ai/${w}/${p}`,
    options = useResource<Options>(base + "/options"),
    history = useResource<AiConversationView>(
      conversation ? base + "/conversations/" + conversation : null,
    );
  const [selection, setSelected] = useState<string[] | null>(null),
    [question, setQuestion] = useState(""),
    [preview, setPreview] = useState<AiContextView>(),
    [consent, setConsent] = useState(false),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [policyOpen, setPolicyOpen] = useState(false),
    [proposalRun, setProposalRun] = useState("");
  const heading = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const seededVersion = options.data?.versions.find((v) =>
    seed?.versionId
      ? v.id === seed.versionId
      : seed?.sourceId && v.sourceId === seed.sourceId,
  );
  const selected = selection ?? (seededVersion ? [seededVersion.id] : []);
  const reloadHistory = history.reload,
    reloadOptions = options.reload;
  const active = history.data?.contexts.some(
    (c) => c.run && ["queued", "running"].includes(c.run.state),
  );
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      reloadHistory();
      reloadOptions();
    }, 1500);
    return () => clearInterval(timer);
  }, [active, reloadHistory, reloadOptions]);
  const policy = options.data?.policy,
    ids = history.data?.conversation.versionIds ?? selected;
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError && [401, 403, 404].includes(e.status)) {
        setPreview(undefined);
        choose("");
      }
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function makePreview() {
    await act(async () => {
      const data = await api<AiContextView>(base + "/preview", {
        question,
        versionIds: ids,
        conversationId: conversation || null,
      });
      setPreview(data);
      setConsent(false);
      choose(data.context.conversationId);
      options.reload();
      history.reload();
    });
  }
  async function send() {
    if (!preview || !consent) return;
    await act(async () => {
      await api(base + "/runs", {
        contextId: preview.context.id,
        requestId: crypto.randomUUID(),
        consent: true,
      });
      setPreview(undefined);
      setConsent(false);
      setQuestion("");
      history.reload();
      options.reload();
    });
  }
  const unavailable =
    !policy?.callsEnabled ||
    !policy.keyConfigured ||
    !policy.enabled ||
    policy.dailyBudgetMicros <= 0;
  return (
    <div className="ai-content">
      <p ref={heading} tabIndex={-1} className="ai-scope">
        {projectName}
        <br />
        <small>Private conversation · fixed source versions</small>
      </p>
      {options.error ? (
        <InlineError error={options.error} />
      ) : !options.data ? (
        <Loading />
      ) : (
        <>
          {policy?.testing && (
            <p role="status" className="notice">
              LOCAL SYNTHETIC TEST · no real model answer
            </p>
          )}
          <div className="actions">
            <button
              onClick={() => {
                choose("");
                setSelected([]);
                setPreview(undefined);
                setQuestion("");
                setConsent(false);
              }}
            >
              New conversation
            </button>
            <button onClick={() => setPolicyOpen((v) => !v)}>
              Usage & sharing
            </button>
          </div>
          <label>
            Private history
            <select
              aria-label="Private AI history"
              value={conversation}
              onChange={(e) => {
                choose(e.target.value);
                setPreview(undefined);
                setQuestion("");
                setConsent(false);
              }}
            >
              <option value="">New conversation</option>
              {options.data.conversations.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          {policy && (
            <>
              <div className="ai-usage">
                Today (UTC): {dollars(policy.usage.spentMicros)} used ·{" "}
                {dollars(policy.usage.heldMicros)} reserved /{" "}
                {dollars(policy.dailyBudgetMicros)}
                <br />
                <small>
                  {policy.usage.requests}/20 requests per user ·{" "}
                  {policy.usage.activeWorkspace}/2 workspace active
                </small>
              </div>
              {unavailable && (
                <p className="notice" role="status">
                  {!policy.callsEnabled
                    ? "AI calls are disabled. No provider request is sent."
                    : !policy.keyConfigured
                      ? "The server API key is not configured."
                      : "Workspace sharing or its daily budget is disabled."}{" "}
                  You can prepare and preview evidence without a model call.
                </p>
              )}
              {policyOpen && (
                <Sharing policy={policy} w={w} reload={options.reload} />
              )}
            </>
          )}
          <details open={!conversation}>
            <summary>Source scope · {ids.length}/10 versions</summary>
            <small>
              The scope stays fixed when you move between pages. Start a new
              conversation to change it.
            </small>
            <fieldset disabled={!!conversation || busy} className="ai-sources">
              {options.data.versions.length === 0 && (
                <p>Add a PDF in this project’s Library first.</p>
              )}
              {options.data.versions.map((v) => (
                <label key={v.id} className="check-row">
                  <input
                    type="checkbox"
                    checked={ids.includes(v.id)}
                    onChange={(e) => {
                      setPreview(undefined);
                      setSelected(
                        e.target.checked
                          ? [...selected, v.id].slice(0, 10)
                          : selected.filter((id) => id !== v.id),
                      );
                    }}
                  />
                  <span>
                    {v.title} · v{v.ordinal}
                    <small>
                      {v.indexed
                        ? "Evidence ready"
                        : v.file
                          ? "PDF evidence not prepared"
                          : "Metadata only · cannot support claims"}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
            {options.data.canEdit &&
              options.data.versions
                .filter((v) => ids.includes(v.id) && v.file && !v.indexed)
                .map((v) => (
                  <button
                    disabled={busy}
                    key={v.id}
                    onClick={() =>
                      act(async () => {
                        await api(
                          `/api/research/${w}/${p}/sources/${v.sourceId}/versions/${v.id}/retry`,
                          {},
                        );
                        options.reload();
                      })
                    }
                  >
                    Prepare evidence · v{v.ordinal}
                  </button>
                ))}
          </details>
          {history.error && <InlineError error={history.error} />}
          {history.data?.contexts
            .filter((c) => c.run)
            .map((c) => (
              <article key={c.id} className="ai-exchange">
                <h3>{c.question}</h3>
                <p role="status" className="muted">
                  {c.run!.state.replaceAll("_", " ")} ·{" "}
                  {dollars(c.run!.chargedMicros)} budget units
                </p>
                {["queued", "running"].includes(c.run!.state) && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      act(async () => {
                        await api(base + `/runs/${c.run!.id}/cancel`, {});
                        history.reload();
                        options.reload();
                      })
                    }
                  >
                    Cancel request
                  </button>
                )}
                {c.run!.error && (
                  <p className="notice">
                    {c.run!.error}. No automatic retry. A dispatched request may
                    retain its full reservation.
                  </p>
                )}
                {c.run!.result && (
                  <>
                    <p className="ai-limitations">
                      {c.run!.result.limitations}
                    </p>
                    {c.run!.result.status === "insufficient" && (
                      <p>
                        Insufficient evidence. No supported answer was produced.
                      </p>
                    )}
                    {c.run!.result.segments.map((s, i) => (
                      <section key={i} className="ai-segment">
                        <p>{s.text}</p>
                        {s.citations.map((ref, j) => {
                          const e = c.evidence.find(
                            (e) => e.id === ref.evidenceId,
                          );
                          return e ? (
                            <details key={j}>
                              <summary>
                                Verified locator · {e.title} · p. {e.page}
                              </summary>
                              <blockquote>{ref.quote}</blockquote>
                              <Link className="ai-citation" href={e.href}>
                                Read cited PDF version · page {e.page}
                              </Link>
                            </details>
                          ) : null;
                        })}
                        <label className="ai-review">
                          Scientific support ·{" "}
                          {c.reviews.find((r) => r.segment === i)?.verdict ??
                            "not reviewed"}
                          <select
                            aria-label={`Review support for claim ${i + 1}`}
                            value={
                              c.reviews.find((r) => r.segment === i)?.verdict ??
                              ""
                            }
                            onChange={(e) => {
                              if (e.target.value)
                                void act(async () => {
                                  await api(
                                    base + `/runs/${c.run!.id}/review`,
                                    { segment: i, verdict: e.target.value },
                                  );
                                  history.reload();
                                });
                            }}
                          >
                            <option value="">
                              Review the claim against its source…
                            </option>
                            {[
                              "supported",
                              "partial",
                              "unsupported",
                              "contradicted",
                            ].map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </select>
                        </label>
                      </section>
                    ))}
                    <p className="muted">
                      Locator validation checks the quote and location.
                      Scientific support requires your review.
                    </p>
                    {history.data?.canEdit && c.run!.state === "complete" && (
                      <button
                        disabled={busy}
                        onClick={() => setProposalRun(c.run!.id)}
                      >
                        Propose into a document
                      </button>
                    )}
                  </>
                )}
                <details>
                  <summary>Shared evidence snapshot</summary>
                  <Evidence items={c.evidence} />
                </details>
              </article>
            ))}
          {!preview &&
            !question &&
            history.data?.contexts
              .filter((c) => !c.run)
              .slice(-1)
              .map((c) => (
                <section className="ai-unsent" key={c.id}>
                  <h3>Saved question preview</h3>
                  <p>{c.question}</p>
                  <small>
                    No provider request was sent. Preview again to refresh
                    evidence; approval is required again.
                  </small>
                  <button
                    disabled={busy}
                    onClick={() => {
                      setQuestion(c.question);
                      setPreview(undefined);
                      setConsent(false);
                    }}
                  >
                    Restore unsent question
                  </button>
                </section>
              ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void makePreview();
            }}
            className="ai-question"
          >
            <label>
              Research question
              <textarea
                aria-label="Research question"
                required
                maxLength={4000}
                rows={3}
                value={question}
                onChange={(e) => {
                  setQuestion(e.target.value);
                  setPreview(undefined);
                  setConsent(false);
                }}
                placeholder="Ask about a finding in the selected PDFs…"
              />
            </label>
            <small>
              Lexical search retrieves a limited set of excerpts. It does not
              read or search the entire literature.
            </small>
            <button
              className="primary"
              disabled={busy || !ids.length || !question.trim()}
            >
              Preview evidence
            </button>
          </form>
          {preview && (
            <section className="ai-preview">
              <h3>Review before sharing</h3>
              {preview.warnings.map((v, i) => (
                <p className="notice" key={i}>
                  {v}
                </p>
              ))}
              <p>
                {preview.evidence.length} excerpts · reserve at most{" "}
                {dollars(preview.reservedMicros)} budget units.
              </p>
              <Evidence items={preview.evidence} />
              <p className="muted">
                Only this question and these excerpts go to OpenAI (
                {policy?.model}), using its global API. Responses are not stored
                as API history; default abuse monitoring may retain content for
                up to 30 days. Do not share material you lack permission to
                send.
              </p>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  I approve sending this question and the displayed excerpts.
                </span>
              </label>
              <button
                className="primary"
                disabled={
                  busy || !consent || unavailable || !preview.evidence.length
                }
                onClick={() => void send()}
              >
                Send approved evidence
              </button>
            </section>
          )}
          <InlineError error={error} />
          {proposalRun && (
            <Proposal
              w={w}
              p={p}
              runId={proposalRun}
              onClose={() => setProposalRun("")}
            />
          )}
        </>
      )}
    </div>
  );
}
function Sharing({
  policy,
  w,
  reload,
}: {
  policy: AiPolicyView;
  w: string;
  reload: () => void;
}) {
  const [enabled, setEnabled] = useState(policy.enabled),
    [budget, setBudget] = useState(String(policy.dailyBudgetMicros / 1000000)),
    [accepted, setAccepted] = useState(false),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="ai-policy"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api(
            `/api/ai/policy/${w}`,
            {
              enabled,
              dailyBudgetMicros: Math.round(Number(budget) * 1000000),
              revision: policy.revision,
              termsVersion: accepted ? policy.terms : "",
            },
            "PATCH",
          );
          reload();
          setAccepted(false);
        } catch (e) {
          setError(e);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        OpenAI global API · {policy.model}. Question and exact excerpts leave
        this server only after per-request approval.{" "}
        <a
          href="https://developers.openai.com/api/docs/guides/your-data"
          target="_blank"
          rel="noreferrer"
        >
          Data controls
        </a>
      </p>
      <p>
        Conservative budget units: $0.50/M input and $1/M output, not a provider
        invoice. One active request per user, two per workspace, 20/user/day.
        Cancel after dispatch or an uncertain timeout can charge the full
        reservation.
      </p>
      {policy.canManage ? (
        <>
          <label className="check-row">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Enable external AI sharing for this workspace
          </label>
          <label>
            Daily workspace cap (USD budget units)
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              required
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            I accept these provider and data conditions.
          </label>
          <button disabled={busy || (enabled && !accepted)}>
            Save sharing policy
          </button>
        </>
      ) : (
        <p>Only the workspace owner can change sharing or its daily cap.</p>
      )}
      <InlineError error={error} />
    </form>
  );
}
function text(node: DocNode): string {
  return (
    node.text ??
    (node.type === "citation"
      ? " [source] "
      : (node.content
          ?.map(text)
          .join(
            ["doc", "paragraph", "heading"].includes(node.type) ? "\n" : "",
          ) ?? ""))
  );
}
type ProposalData = {
  proposal: {
    id: string;
    before: DocNode;
    after: DocNode;
    revision: number;
    appliedRevision: number | null;
    undoRevision: number | null;
  };
  document: { id: string; title: string; revision: number };
  canEdit: boolean;
};
function Proposal({
  w,
  p,
  runId,
  onClose,
}: {
  w: string;
  p: string;
  runId: string;
  onClose: () => void;
}) {
  const base = `/api/ai/${w}/${p}`,
    docs = useResource<{
      items: { id: string; title: string; revision: number }[];
    }>(`/api/collaboration/${w}/${p}/documents`),
    [id, setId] = useState(""),
    [data, setData] = useState<ProposalData>(),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Review document proposal" onClose={onClose}>
      <p>
        Review both versions. Applying creates a new document revision with
        source citations.
      </p>
      {!data ? (
        <>
          <label>
            Target document
            <select
              aria-label="Target document"
              value={id}
              onChange={(e) => setId(e.target.value)}
            >
              <option value="">Choose a document…</option>
              {docs.data?.items.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={busy || !id}
            onClick={() =>
              act(async () => {
                const d = await api<{ document: { revision: number } }>(
                  `/api/collaboration/${w}/${p}/documents/${id}`,
                );
                const proposal = await api<{ id: string }>(
                  base + "/proposals",
                  {
                    requestId: crypto.randomUUID(),
                    runId,
                    documentId: id,
                    revision: d.document.revision,
                  },
                );
                setData(await api(base + "/proposals/" + proposal.id));
              })
            }
          >
            Preview proposal
          </button>
        </>
      ) : (
        <>
          <p>
            {data.document.title} · based on revision {data.proposal.revision},
            current revision {data.document.revision}
          </p>
          <div className="ai-diff">
            <section>
              <h3>Before</h3>
              <pre>{text(data.proposal.before)}</pre>
            </section>
            <section>
              <h3>Proposed</h3>
              <pre>{text(data.proposal.after)}</pre>
            </section>
          </div>
          {data.proposal.appliedRevision ? (
            <>
              <p role="status">
                {data.proposal.undoRevision
                  ? "Proposal undone as a new revision."
                  : "Proposal applied as a new revision."}
              </p>
              <Link href={`/w/${w}/p/${p}/docs/${data.document.id}`}>
                Open document
              </Link>
              {!data.proposal.undoRevision && (
                <button
                  disabled={busy || !data.canEdit}
                  onClick={() =>
                    act(async () => {
                      await api(
                        base + `/proposals/${data.proposal.id}/undo`,
                        {},
                      );
                      setData(
                        await api(base + "/proposals/" + data.proposal.id),
                      );
                    })
                  }
                >
                  Undo applied proposal
                </button>
              )}
            </>
          ) : (
            <button
              className="primary"
              disabled={busy || !data.canEdit}
              onClick={() =>
                act(async () => {
                  await api(base + `/proposals/${data.proposal.id}/apply`, {});
                  setData(await api(base + "/proposals/" + data.proposal.id));
                })
              }
            >
              Apply reviewed proposal
            </button>
          )}
        </>
      )}
      <InlineError error={error} />
    </Modal>
  );
}
