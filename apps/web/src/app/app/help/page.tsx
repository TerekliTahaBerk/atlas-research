import { isLive } from '@/lib/env';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Topbar } from '@/features/shell/topbar';
export const metadata = { title: 'Help' };
const linkCls = 'text-actx underline-offset-2 hover:underline';
export default function Page() {
  if (isLive()) notFound();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar />
      <div className="min-h-0 flex-1 overflow-auto">
        <article className="mx-auto max-w-[680px] px-8 pt-10 pb-20 max-sm:px-4">
          <h1 className="mb-2 font-serif text-[34px] leading-[1.1] font-medium">
            Make yourself at home.
          </h1>
          <p className="mb-8 text-ui text-tx2">
            A few simple ways to move through the Atlas preview.
          </p>
          <div className="flex flex-col gap-6 font-read text-[15px] leading-[1.75] text-tx2">
            <section>
              <h2 className="mb-1 font-serif text-[22px] font-medium text-tx">
                Stay in context
              </h2>
              <p>
                ⌘/Ctrl K opens search, ⌘/Ctrl J opens Atlas in focus mode,
                ⌘/Ctrl \ toggles the sidebar and ? lists every shortcut. In the
                composer, @ attaches a sample reference and / opens commands for
                the current screen.
              </p>
            </section>
            <section>
              <h2 className="mb-1 font-serif text-[22px] font-medium text-tx">
                Explore the design
              </h2>
              <p>
                <Link className={linkCls} href="/login">
                  Sign in preview
                </Link>{' '}
                ·{' '}
                <Link className={linkCls} href="/register">
                  Sign up preview
                </Link>{' '}
                ·{' '}
                <Link className={linkCls} href="/reset-password">
                  Recovery preview
                </Link>{' '}
                ·{' '}
                <Link className={linkCls} href="/onboarding">
                  Onboarding walkthrough
                </Link>{' '}
                ·{' '}
                <Link className={linkCls} href="/app/design-system">
                  Design system
                </Link>
              </p>
            </section>
            <section>
              <h2 className="mb-1 font-serif text-[22px] font-medium text-tx">
                What is saved?
              </h2>
              <p>
                Only appearance and sidebar preferences are stored in your
                browser. Documents, messages, tasks, prompts and reading lists
                are in-memory demonstrations and reset when you reload. Do not
                enter private research into this public preview.
              </p>
            </section>
            <section>
              <h2 className="mb-1 font-serif text-[22px] font-medium text-tx">
                What is not connected?
              </h2>
              <p>
                No model, scholarly search, LaTeX compiler, code kernel,
                notification, sharing, invitation or billing service exists in
                Phase 00.5A. Atlas answers, thinking steps, compile status and
                notebook outputs are labeled samples. Identity arrives in Phase
                01; discovery in Phase 02; grounded AI in Phase 03; persisted
                notes and tasks in Phase 04; communication in Phase 05;
                sandboxed compilation and execution in Phase 07.
              </p>
            </section>
          </div>
        </article>
      </div>
    </div>
  );
}
