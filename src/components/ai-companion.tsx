"use client";
import { useEffect, useRef, useState, useReducer } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import katex from "katex";
import { usePathname } from "next/navigation";
import { useNavigationBlocker } from "./navigation-safety";
import { TaskLinkPicker } from "./task-form";
import { CreateArtifactDialog } from "./collaboration-shared";
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
  const key = `atlas-ai-v2:${userId}:${w}:${p}`;
  const saved = () => {
    try {
      return JSON.parse(sessionStorage.getItem(key) ?? "{}");
    } catch {
      return {};
    }
  };
  const [mode, dispatch] = useReducer(
    (_: Presentation, next: Presentation) => next,
    "compact",
    () =>
      ["compact", "floating", "docked"].includes(saved().mode)
        ? (saved().mode as Presentation)
        : "compact",
  );
  useEffect(() => {
    if (!["compact", "hidden"].includes(mode))
      window.dispatchEvent(new Event("atlas-ai-refresh"));
  }, [mode]);
  const [conversation, setConversation] = useState<string>(
    () => saved().id ?? "",
  );
  const [seed, setSeed] = useState<Seed>();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [activity, setActivity] = useState(false);
  const surface = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const observe = () => setTarget(document.getElementById("atlas-ai-toggle"));
    observe();
    const observer = new MutationObserver(observe);
    observer.observe(document.body, { childList: true, subtree: true });
    const launch = (event: Event) => {
      const data = (event as CustomEvent<Seed>).detail;
      if (data.w !== w || data.p !== p) return;
      setSeed(data);
      dispatch("floating");
    };
    const writing = () => dispatch("compact");
    const keyboard = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        dispatch("floating");
        surface.current
          ?.querySelector<HTMLTextAreaElement>("textarea")
          ?.focus();
      }
    };
    window.addEventListener("keydown", keyboard);
    window.addEventListener("atlas-ai-open", launch);
    window.addEventListener("atlas-document-tools-open", writing);
    window.addEventListener("atlas-research-writing", writing);
    window.addEventListener("atlas-modal-opened", writing);
    window.addEventListener("atlas-menu-opened", writing);
    return () => {
      observer.disconnect();
      window.removeEventListener("keydown", keyboard);
      window.removeEventListener("atlas-ai-open", launch);
      window.removeEventListener("atlas-document-tools-open", writing);
      window.removeEventListener("atlas-research-writing", writing);
      window.removeEventListener("atlas-modal-opened", writing);
      window.removeEventListener("atlas-menu-opened", writing);
    };
  }, [key, w, p]);
  useEffect(() => {
    const update = () => {
      const main = (
        document.querySelector(".discussion-conversation") ??
        document.querySelector(".main-pane")
      )?.getBoundingClientRect();
      if (!main || !surface.current) return;
      const rail = document
        .querySelector(
          ".task-detail-rail,.source-inspector,.reader-notes,.document-side-panel",
        )
        ?.getBoundingClientRect();
      const available = main.width - (rail && rail.width > 0 ? rail.width : 0);
      const width = Math.max(240, Math.min(680, available - 48));
      surface.current.style.setProperty(
        "--ai-left",
        `${main.left + Math.max(12, (available - width) / 2)}px`,
      );
      surface.current.style.setProperty("--ai-width", `${width}px`);
      surface.current.style.setProperty(
        "--ai-bottom",
        document.querySelector(".reader-experience") ? "52px" : "18px",
      );
      surface.current.style.setProperty(
        "--ai-visible-height",
        `${window.visualViewport?.height ?? innerHeight}px`,
      );
    };
    const resize = new ResizeObserver(update);
    resize.observe(document.body);
    const observer = new MutationObserver(update);
    observer.observe(document.getElementById("atlas-workspace-pages")!, {
      childList: true,
      subtree: true,
    });
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    update();
    return () => {
      resize.disconnect();
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [mode]);
  useEffect(() => {
    const resize = () => {
      if (mode === "docked" && innerWidth < 1200) dispatch("focus");
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [mode]);
  function present(next: Presentation) {
    dispatch(next);
    if (next !== "compact" && next !== "hidden")
      window.dispatchEvent(new Event("atlas-ai-opened"));
    if (next === "compact" || next === "hidden") trigger.current?.focus();
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({
          id: conversation,
          mode: next === "focus" ? "floating" : next,
        }),
      );
    } catch {}
  }
  function choose(id: string) {
    setConversation(id);
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({ id, mode: mode === "focus" ? "floating" : mode }),
      );
    } catch {}
  }
  useEffect(() => {
    if (mode !== "focus") return;
    const background = document.getElementById("atlas-workspace-pages");
    if (background) background.inert = true;
    const previous = document.activeElement as HTMLElement | null;
    surface.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      if (background) background.inert = false;
      previous?.focus();
    };
  }, [mode]);
  return (
    <>
      {target &&
        createPortal(
          <button
            ref={trigger}
            className="ai-toggle"
            aria-label="Ask Atlas"
            aria-expanded={mode !== "compact" && mode !== "hidden"}
            onClick={() =>
              present(
                mode === "compact" || mode === "hidden"
                  ? "floating"
                  : "compact",
              )
            }
          >
            <Icon name="sparkles" />
            <span>Ask Atlas</span>
          </button>,
          target,
        )}
      {mode === "focus" && (
        <div className="ai-island-dim" onClick={() => present("floating")} />
      )}
      <aside
        ref={surface}
        className="ai-island"
        data-presentation={mode}
        aria-label="Ask Atlas"
        role={mode === "focus" ? "dialog" : "complementary"}
        aria-modal={mode === "focus" || undefined}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            present(mode === "focus" ? "floating" : "compact");
          }
          if (mode === "focus" && e.key === "Tab") {
            const nodes = [
              ...surface.current!.querySelectorAll<HTMLElement>(
                "button:not(:disabled),textarea:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],summary",
              ),
            ].filter((n) => n.getClientRects().length);
            if (e.shiftKey && document.activeElement === nodes[0]) {
              e.preventDefault();
              nodes.at(-1)?.focus();
            }
            if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
              e.preventDefault();
              nodes[0]?.focus();
            }
          }
        }}
      >
        <div className="ai-island-heading">
          <strong>
            <Icon name="sparkles" /> Atlas{" "}
            <small role="status">
              {activity ? "Request in progress" : "Private research"}
            </small>
          </strong>
          <nav aria-label="AI presentation">
            <button aria-label="Compact AI" onClick={() => present("compact")}>
              −
            </button>
            <button
              aria-label="Floating AI"
              aria-pressed={mode === "floating"}
              onClick={() => present("floating")}
            >
              Float
            </button>
            <button
              aria-label="Focus AI"
              aria-pressed={mode === "focus"}
              onClick={() => present("focus")}
            >
              Focus
            </button>
            <button
              className="ai-dock-action"
              aria-label="Dock AI"
              aria-pressed={mode === "docked"}
              onClick={() => present("docked")}
            >
              Dock
            </button>
          </nav>
        </div>
        <AiPanel
          w={w}
          p={p}
          conversation={conversation}
          choose={choose}
          seed={seed}
          projectName={projectName}
          onActivity={setActivity}
          expand={() => present("floating")}
        />
      </aside>
    </>
  );
}
type Presentation = "compact" | "floating" | "focus" | "docked" | "hidden";

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
          <details className="evidence-provenance">
            <summary>Source verification</summary>
            <small>
              Verified location · characters {e.start}–{e.end}
            </small>
            <small className="ai-hash">
              PDF SHA-256 {e.fileSha256}
              <br />
              Quote SHA-256 {e.quoteHash}
              <br />
              {e.extractor}
            </small>
          </details>
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
  onActivity,
  expand,
}: {
  onActivity: (active: boolean) => void;
  expand: () => void;
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
  const pathname = usePathname();
  const [passage, setPassage] = useState("");
  const [artifactIds, setArtifacts] = useState<string[]>([]);
  const [taskDraft, setTaskDraft] = useState("");
  const [selection, setSelected] = useState<string[] | null>(null),
    [question, setQuestion] = useState(""),
    [preview, setPreview] = useState<AiContextView>(),
    [consent, setConsent] = useState(false),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [policyOpen, setPolicyOpen] = useState(false),
    [earlierVersions, setEarlierVersions] = useState(false),
    [proposalRun, setProposalRun] = useState("");
  useNavigationBlocker({
    label: busy
      ? "An AI request is awaiting acknowledgement. Stay until it completes; no duplicate request will be sent."
      : "The unsent AI draft belongs to this project. Switching projects discards this in-memory draft.",
    pending: (href) => {
      const target = href.match(/\/w\/([^/]+)\/p\/([^/?#]+)/);
      const workspace = href.match(/^\/w\/([^/]+)/)?.[1];
      const leaving = target
        ? target[1] !== w || target[2] !== p
        : !!workspace && workspace !== w;
      return leaving && (busy || !!question.trim() || !!passage.trim());
    },
    flush: async () => false,
    ...(!busy
      ? {
          discard: () => {
            setQuestion("");
            setPassage("");
          },
        }
      : {}),
  });
  const heading = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    // The compact composer remains writable without stealing editor focus.
  }, []);
  const seededVersion = options.data?.versions.find((v) =>
    seed?.versionId
      ? v.id === seed.versionId
      : seed?.sourceId && v.sourceId === seed.sourceId,
  );
  const selected = selection ?? (seededVersion ? [seededVersion.id] : []);
  const reloadHistory = history.reload,
    reloadOptions = options.reload;
  useEffect(() => {
    const refresh = () => {
      reloadOptions();
      if (conversation) reloadHistory();
    };
    window.addEventListener("atlas-research-changed", refresh);
    window.addEventListener("atlas-ai-refresh", refresh);
    return () => {
      window.removeEventListener("atlas-research-changed", refresh);
      window.removeEventListener("atlas-ai-refresh", refresh);
    };
  }, [reloadOptions, reloadHistory, conversation]);
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
  useEffect(() => {
    onActivity(busy || !!active);
  }, [busy, active, onActivity]);
  async function makePreview() {
    expand();
    await act(async () => {
      const data = await api<AiContextView>(base + "/preview", {
        question,
        versionIds: ids,
        artifactIds: history.data?.conversation.artifactIds ?? artifactIds,
        selection: passage || undefined,
        conversationId: conversation || null,
      });
      setPreview(data);
      setConsent(false);
      choose(data.context.conversationId);
      options.reload();
      history.reload();
    });
  }
  const runRequest = useRef<{ context: string; id: string } | null>(null);
  async function send() {
    if (!preview || !consent) return;
    await act(async () => {
      await api(base + "/runs", {
        contextId: preview.context.id,
        requestId: (runRequest.current?.context === preview.context.id
          ? runRequest.current
          : (runRequest.current = {
              context: preview.context.id,
              id: crypto.randomUUID(),
            })
        ).id,
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
      <button
        className="ai-context-open"
        aria-label="Add AI context"
        onClick={() => {
          expand();
          document
            .querySelector<HTMLDetailsElement>(".ai-scope-picker")
            ?.setAttribute("open", "");
        }}
      >
        +
      </button>
      <p ref={heading} tabIndex={-1} className="ai-scope">
        {projectName}
        <br />
        <small>Private · selected papers</small>
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
                setArtifacts([]);
                setPreview(undefined);
                setQuestion("");
                setConsent(false);
              }}
            >
              New conversation
            </button>
            <button onClick={() => history.reload()}>Refresh history</button>
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
              {policyOpen && (
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
              )}
              {unavailable && (
                <p className="notice" role="status">
                  {!policy.callsEnabled
                    ? "AI answers are turned off. You can still search your papers for evidence."
                    : !policy.keyConfigured
                      ? "The server API key is not configured."
                      : "Workspace sharing or its daily budget is disabled."}{" "}
                </p>
              )}
              {policyOpen && (
                <Sharing policy={policy} w={w} reload={options.reload} />
              )}
            </>
          )}
          {seededVersion && !ids.includes(seededVersion.id) && (
            <section className="ai-context-suggestion">
              <p>
                Suggested context: {seededVersion.title} · v
                {seededVersion.ordinal}
              </p>
              <button
                disabled={busy}
                onClick={() => {
                  choose("");
                  setSelected(
                    [...new Set([...ids, seededVersion.id])].slice(0, 10),
                  );
                  setArtifacts(
                    history.data?.conversation.artifactIds ?? artifactIds,
                  );
                  setPreview(undefined);
                  setConsent(false);
                }}
              >
                Review in a new conversation
              </button>
            </section>
          )}
          <details className="ai-scope-picker" open={!conversation}>
            <summary>Source scope · {ids.length}/10 versions</summary>
            {conversation && (
              <small>
                The scope stays fixed when you move between pages. Start a new
                conversation to change it.
              </small>
            )}
            {!conversation && (
              <>
                <TaskLinkPicker
                  w={w}
                  p={p}
                  value={artifactIds}
                  onChange={setArtifacts}
                />
                <button
                  onClick={() => {
                    const id =
                      new URL(location.href).searchParams.get("annotation") ??
                      pathname.match(
                        /\/(?:docs|tasks|discussions|sources)\/([a-f0-9-]{36})/,
                      )?.[1];
                    const version = new URL(location.href).searchParams.get(
                      "version",
                    );
                    const source = options.data?.versions.find(
                      (v) =>
                        v.sourceId === id && (!version || v.id === version),
                    );
                    if (source)
                      setSelected((old) =>
                        [...new Set([...(old ?? []), source.id])].slice(0, 10),
                      );
                    if (id)
                      setArtifacts((old) =>
                        [...new Set([...old, id])].slice(0, 10),
                      );
                  }}
                >
                  Suggest current page as context
                </button>
              </>
            )}
            {conversation && (
              <button
                onClick={() => {
                  choose("");
                  setPreview(undefined);
                  setConsent(false);
                  setSelected([...ids]);
                  setArtifacts(history.data?.conversation.artifactIds ?? []);
                }}
              >
                Fork with reviewed scope
              </button>
            )}
            {(history.data?.conversation.artifactIds ?? artifactIds).map(
              (id) => (
                <p className="ai-context-chip" key={id}>
                  {history.data?.contexts
                    .flatMap((c) => c.artifacts ?? [])
                    .find((a) => a.id === id)?.title ??
                    "Selected project research"}{" "}
                  <button
                    disabled={!!conversation}
                    aria-label="Remove research context"
                    onClick={() =>
                      setArtifacts((old) => old.filter((v) => v !== id))
                    }
                  >
                    ×
                  </button>
                </p>
              ),
            )}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const text = window.getSelection()?.toString().trim();
                if (text) setPassage(text.slice(0, 4000));
              }}
            >
              Use selected passage
            </button>
            {passage && (
              <p className="ai-context-chip">
                Selected passage: {passage}
                <button onClick={() => setPassage("")}>Remove passage</button>
              </p>
            )}
            <fieldset disabled={!!conversation || busy} className="ai-sources">
              {options.data.versions.length === 0 && (
                <p>Add a PDF in this project’s Library first.</p>
              )}
              {options.data.versions
                .filter((v) =>
                  conversation
                    ? ids.includes(v.id)
                    : earlierVersions ||
                      ids.includes(v.id) ||
                      !options.data!.versions.some(
                        (other) =>
                          other.sourceId === v.sourceId &&
                          other.ordinal > v.ordinal,
                      ),
                )
                .map((v) => (
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
            {!conversation && (
              <label className="compact-check">
                <input
                  type="checkbox"
                  checked={earlierVersions}
                  onChange={(e) => setEarlierVersions(e.target.checked)}
                />
                Show earlier versions
              </label>
            )}
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
                {[
                  "cancelled",
                  "limited",
                  "provider_error",
                  "validation_failed",
                ].includes(c.run!.state) && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      setQuestion(c.question);
                      setPreview(undefined);
                      setConsent(false);
                    }}
                  >
                    Retry question with a new evidence preview
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
                    <button
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(
                            c
                              .run!.result!.segments.map((s) => s.text)
                              .join("\n\n"),
                          )
                          .catch(setError)
                      }
                    >
                      Copy answer
                    </button>
                    {history.data?.canEdit && (
                      <button
                        onClick={() =>
                          setTaskDraft(
                            c
                              .run!.result!.segments.map((s) => s.text)
                              .join("\n\n"),
                          )
                        }
                      >
                        Review task draft
                      </button>
                    )}
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
                        <AnswerText value={s.text} />
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
                          ) : (
                            (() => {
                              const artifact = c.artifacts?.find(
                                (a) => a.id === ref.evidenceId,
                              );
                              return artifact ? (
                                <details key={j}>
                                  <summary>
                                    {artifact.title}
                                    {artifact.revision
                                      ? ` · revision ${artifact.revision}`
                                      : ""}
                                    {artifact.page
                                      ? ` · page ${artifact.page}`
                                      : ""}
                                  </summary>
                                  <blockquote>{ref.quote}</blockquote>
                                  <Link href={artifact.href}>
                                    Open cited research object
                                  </Link>
                                </details>
                              ) : null;
                            })()
                          );
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
                    <button
                      onClick={() =>
                        document
                          .querySelector(".ai-question")
                          ?.scrollIntoView({ block: "end" })
                      }
                    >
                      Return to composer
                    </button>
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
          <label className="ai-research-action">
            Research action
            <select
              aria-label="Research action"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  setQuestion(e.target.value);
                  setPreview(undefined);
                  setConsent(false);
                }
                e.target.value = "";
              }}
            >
              <option value="">Choose an instruction…</option>
              <option value="Explain the selected passage using its evidence and identify uncertainties.">
                Explain passage
              </option>
              <option value="Summarize the selected sources with citations and explicit limitations.">
                Summarize sources
              </option>
              <option value="Compare the selected sources, citing agreements and disagreements.">
                Compare sources
              </option>
              <option value="Propose research next steps grounded in the selected sources.">
                Draft research steps
              </option>
            </select>
          </label>
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
                  if (e.target.value.endsWith("@")) {
                    expand();
                    document
                      .querySelector(".ai-scope-picker")
                      ?.setAttribute("open", "");
                  }
                  setPreview(undefined);
                  setConsent(false);
                }}
                placeholder="Ask Atlas… (@ to choose sources)"
              />
            </label>
            <button
              className="primary"
              disabled={
                busy ||
                (!ids.length &&
                  !artifactIds.length &&
                  !history.data?.conversation.artifactIds?.length) ||
                !question.trim()
              }
            >
              Preview evidence
            </button>
          </form>
          {preview && (
            <section className="ai-preview">
              <h3>
                {unavailable
                  ? "Evidence from your papers"
                  : "Review before sharing"}
              </h3>
              {preview.warnings.map((v, i) => (
                <p className="notice" key={i}>
                  {v}
                </p>
              ))}
              <p>
                {preview.evidence.length} matching excerpts
                {!unavailable && (
                  <>
                    {" "}
                    · reserve at most {dollars(preview.reservedMicros)} budget
                    units
                  </>
                )}
              </p>
              {preview.context.artifacts?.map((a) => (
                <details key={a.id}>
                  <summary>
                    {a.kind} · {a.title}
                    {a.revision ? ` · revision ${a.revision}` : ""}
                    {a.page ? ` · page ${a.page}` : ""}
                  </summary>
                  <pre>{a.text}</pre>
                  <Link href={a.href}>Open original context</Link>
                </details>
              ))}
              <Evidence items={preview.evidence} />
              {!unavailable && (
                <>
                  <p className="muted">
                    Only this question and these excerpts go to OpenAI (
                    {policy?.model}), using its global API. Responses are not
                    stored as API history; default abuse monitoring may retain
                    content for up to 30 days. Do not share material you lack
                    permission to send.
                  </p>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    <span>
                      I approve sending this question and the displayed
                      excerpts.
                    </span>
                  </label>
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      !consent ||
                      unavailable ||
                      (!preview.evidence.length &&
                        !preview.context.artifacts?.some((a) => a.text))
                    }
                    onClick={() => void send()}
                  >
                    Send approved evidence
                  </button>
                </>
              )}
            </section>
          )}
          <InlineError error={error} />
          {taskDraft && (
            <CreateArtifactDialog
              w={w}
              p={p}
              kind="task"
              initialText={taskDraft}
              onClose={() => setTaskDraft("")}
            />
          )}
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

function AnswerText({ value }: { value: string }) {
  const blocks = value.split(/(```[\s\S]*?```|\$\$[\s\S]*?\$\$)/g);
  const math = (source: string, displayMode: boolean) =>
    katex.renderToString(source, {
      displayMode,
      throwOnError: false,
      trust: false,
      strict: "warn",
    });
  return (
    <div className="ai-answer-text">
      {blocks.map((block, i) =>
        block.startsWith("```") ? (
          <pre key={i}>
            <code>
              {block.replace(/^```[^\n]*\n?/, "").replace(/```$/, "")}
            </code>
          </pre>
        ) : block.startsWith("$$") ? (
          <div
            key={i}
            dangerouslySetInnerHTML={{ __html: math(block.slice(2, -2), true) }}
          />
        ) : (
          <div key={i}>
            {block.split("\n").map((line, j) => (
              <div key={j}>
                {/^(?:[-*] |[0-9]+\. )/.test(line) ? (
                  <ul>
                    <li>{line.replace(/^(?:[-*] |[0-9]+\. )/, "")}</li>
                  </ul>
                ) : (
                  <p>
                    {line.split(/(\$[^$\n]+\$)/g).map((part, k) =>
                      part.startsWith("$") && part.endsWith("$") ? (
                        <span
                          key={k}
                          dangerouslySetInnerHTML={{
                            __html: math(part.slice(1, -1), false),
                          }}
                        />
                      ) : (
                        <span key={k}>{part}</span>
                      ),
                    )}
                  </p>
                )}
              </div>
            ))}
          </div>
        ),
      )}
    </div>
  );
}
