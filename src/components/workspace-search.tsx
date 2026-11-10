"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Modal, Failure, Icon, Loading, useResource } from "./ui";
type Result = {
  id: string;
  kind: string;
  title: string;
  href: string;
  workspaceName: string;
  projectName: string;
};
export function WorkspaceSearch({ close }: { close: () => void }) {
  const [q, setQ] = useState(""),
    [term, setTerm] = useState(""),
    [kind, setKind] = useState("all"),
    [page, setPage] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setTerm(q.trim()), 250);
    return () => clearTimeout(timer);
  }, [q]);
  const data = useResource<{
    items: Result[];
    total: number;
    pageSize: number;
  }>(
    term.length >= 2
      ? "/api/search?" +
          new URLSearchParams({ q: term, kind, page: String(page) })
      : null,
  );
  return (
    <Modal title="Search your workspace" onClose={close}>
      <div className="workspace-search">
        <label>
          Search projects and research
          <input
            autoFocus
            type="search"
            maxLength={120}
            placeholder="Title, source author / DOI, or PDF note text…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <select
          aria-label="Search result type"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setPage(0);
          }}
        >
          {[
            "all",
            "project",
            "source",
            "document",
            "task",
            "discussion",
            "annotation",
          ].map((k) => (
            <option value={k} key={k}>
              {k === "all"
                ? "All research"
                : k === "annotation"
                  ? "PDF notes"
                  : k[0].toUpperCase() + k.slice(1) + "s"}
            </option>
          ))}
        </select>
        <p>
          Only research you can currently access is searched. Documents, tasks
          and topics match by title.
        </p>
        {term.length < 2 ? (
          <p>Enter at least two characters.</p>
        ) : data.error ? (
          <Failure error={data.error} retry={data.reload} />
        ) : !data.data ? (
          <Loading />
        ) : (
          <>
            <div className="workspace-search-results">
              {data.data.items.map((r) => (
                <Link key={r.kind + r.id} href={r.href} onClick={close}>
                  <Icon
                    name={
                      r.kind === "document"
                        ? "note"
                        : r.kind === "task"
                          ? "check"
                          : r.kind === "discussion"
                            ? "discussion"
                            : r.kind === "project"
                              ? "folder"
                              : "book"
                    }
                  />
                  <span>
                    <strong>{r.title}</strong>
                    <small>
                      {r.kind} · {r.workspaceName} · {r.projectName}
                    </small>
                  </span>
                </Link>
              ))}
              {!data.data.items.length && (
                <p>No matching research in your accessible projects.</p>
              )}
            </div>
            <nav className="dashboard-pages" aria-label="Search pages">
              <button disabled={!page} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <span>
                {data.data.total} results · Page {page + 1}
              </span>
              <button
                disabled={(page + 1) * 25 >= data.data.total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </nav>
          </>
        )}
      </div>
    </Modal>
  );
}
