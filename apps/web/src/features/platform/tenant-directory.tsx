'use client';
import { useState } from 'react';
import {
  organizationPageDto,
  workspacePageDto,
  type PlatformState,
} from '@atlas/core';
import { requestData } from './client';
export function TenantDirectory({ state }: { state: PlatformState }) {
  const [organizations, setOrganizations] = useState(state.organizations);
  const [workspaces, setWorkspaces] = useState(state.workspaces);
  const [orgCursor, setOrgCursor] = useState(state.organizationsCursor);
  const [wsCursor, setWsCursor] = useState(state.workspacesCursor);
  const [error, setError] = useState('');
  return (
    <div className="mb-6 text-xs text-tx2">
      <div className="mb-2 flex flex-wrap gap-2">
        {organizations.map((o) => (
          <a
            key={o.id}
            href={`/app/settings/workspace?organizationId=${o.id}`}
            className="rounded-lg border border-bd px-3 py-2"
          >
            {o.name}
          </a>
        ))}
        {orgCursor ? (
          <button
            type="button"
            className="text-actx underline"
            onClick={async () => {
              try {
                const page = await requestData(
                  `/api/v1/organizations?cursor=${encodeURIComponent(orgCursor)}`,
                  organizationPageDto,
                );
                setOrganizations((list) => [
                  ...list,
                  ...page.items.filter((x) => !list.some((y) => y.id === x.id)),
                ]);
                setOrgCursor(page.nextCursor);
              } catch (error) {
                setError(
                  error instanceof Error
                    ? error.message
                    : 'Unable to load organizations.',
                );
              }
            }}
          >
            More organizations
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {workspaces.map((w) => (
          <a
            key={w.id}
            href={`/app/workspaces/${w.id}`}
            className="rounded-lg border border-bd px-3 py-2"
          >
            {w.name}
          </a>
        ))}
        {wsCursor ? (
          <button
            type="button"
            className="text-actx underline"
            onClick={async () => {
              try {
                const page = await requestData(
                  `/api/v1/workspaces?cursor=${encodeURIComponent(wsCursor)}`,
                  workspacePageDto,
                );
                setWorkspaces((list) => [
                  ...list,
                  ...page.items.filter((x) => !list.some((y) => y.id === x.id)),
                ]);
                setWsCursor(page.nextCursor);
              } catch (error) {
                setError(
                  error instanceof Error
                    ? error.message
                    : 'Unable to load workspaces.',
                );
              }
            }}
          >
            More workspaces
          </button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
