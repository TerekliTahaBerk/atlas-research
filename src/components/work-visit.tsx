"use client";
import { useEffect } from "react";
import { api } from "@/lib/api";
const pending = new Set<Promise<unknown>>();
export const flushWorkVisits = () => Promise.allSettled([...pending]);
export function WorkVisit({
  w,
  p,
  id,
  kind,
  versionId = null,
}: {
  w: string;
  p: string;
  id: string;
  kind: "source" | "document";
  versionId?: string | null;
}) {
  useEffect(() => {
    const request = api("/api/home/visits", {
      workspaceId: w,
      projectId: p,
      artifactId: id,
      kind,
      versionId,
    }).catch(() => undefined);
    pending.add(request);
    void request.finally(() => {
      pending.delete(request);
    });
  }, [w, p, id, kind, versionId]);
  return null;
}
