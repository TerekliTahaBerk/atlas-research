'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { mutate } from './client';
import { buttonClass } from './live-home';
export function InviteScreen({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState(
    'Sign in with the verified email address this invitation was sent to. Complete personal onboarding before accepting.',
  );
  const [busy, setBusy] = useState(false);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-6 text-tx">
      <div className="w-full max-w-[420px]">
        <h1 className="mb-3 font-serif text-4xl">Join your research team</h1>
        <p role="status" className="mb-6 text-ui text-tx2">
          {message}
        </p>
        {!signedIn ? (
          <div className="mb-4 flex gap-4">
            <a
              href="/login?next=/invite"
              onClick={(e) => {
                e.preventDefault();
                router.push('/login?next=/invite' + window.location.hash);
              }}
              className="text-actx underline"
            >
              Sign in
            </a>
            <a
              href="/register?next=/invite"
              onClick={(e) => {
                e.preventDefault();
                router.push('/register?next=/invite' + window.location.hash);
              }}
              className="text-actx underline"
            >
              Create an account
            </a>
          </div>
        ) : null}
        <p className="mb-4 text-xs text-tx3">
          After email verification or onboarding, reopen the original invitation
          link. The token stays in its URL fragment and is never stored in your
          browser.
        </p>
        <button
          disabled={busy || !signedIn}
          className={buttonClass}
          onClick={async () => {
            setBusy(true);
            try {
              const token =
                new URLSearchParams(window.location.hash.slice(1)).get(
                  'token',
                ) ?? '';
              const result = await mutate({
                command: 'invitation.accept',
                token,
              });
              history.replaceState(null, '', '/invite');
              router.push(
                result.projectId
                  ? `/app/projects/${result.projectId}/overview`
                  : result.workspaceId
                    ? `/app/workspaces/${result.workspaceId}`
                    : '/app/settings/workspace',
              );
            } catch (error) {
              setMessage(
                error instanceof Error
                  ? error.message
                  : 'Invitation unavailable.',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Accepting…' : 'Accept invitation'}
        </button>
        <a href="/onboarding" className="ml-4 text-xs text-actx underline">
          Complete setup
        </a>
      </div>
    </main>
  );
}
