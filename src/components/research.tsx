"use client";
import dynamic from "next/dynamic";
import { WorkspaceShell } from "./workspace-shell";
import { useResource, Loading, Failure } from "./ui";
import type { ResearchDetail } from "@/lib/research-types";
import { LibraryExperience } from "./library-experience";
const PdfReader = dynamic(
  () => import("./research-reader").then((m) => m.PdfReader),
  { ssr: false, loading: () => <Loading /> },
);
export function ResearchScreen({
  w,
  p,
  mode,
  sourceId,
}: {
  w: string;
  p: string;
  mode: "library" | "discover" | "source" | "reader";
  sourceId?: string;
}) {
  const detail = useResource<ResearchDetail>(
    mode === "reader" && sourceId
      ? `/api/research/${w}/${p}/sources/${sourceId}`
      : null,
    false,
    true,
  );
  return (
    <WorkspaceShell
      surface={mode === "reader" ? "reader" : "library"}
      title={
        mode === "reader"
          ? (detail.data?.source.title ?? "PDF Reader")
          : "Library"
      }
    >
      {({ me }) =>
        mode === "reader" ? (
          detail.data ? (
            <div className="research-surface reader-surface">
              <PdfReader
                key={`${me.user.id}/${w}/${p}/${sourceId}`}
                w={w}
                p={p}
                detail={detail.data}
                userId={me.user.id}
                canEdit={detail.data.canEdit}
                reload={detail.reload}
                readError={detail.error}
              />
            </div>
          ) : detail.error ? (
            <Failure error={detail.error} retry={detail.reload} />
          ) : (
            <Loading />
          )
        ) : (
          <LibraryExperience
            key={`${me.user.id}/${w}/${p}`}
            w={w}
            p={p}
            userId={me.user.id}
            initialSourceId={sourceId}
          />
        )
      }
    </WorkspaceShell>
  );
}
