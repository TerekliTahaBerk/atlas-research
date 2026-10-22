import { isLive } from '@/lib/env';
import Link from 'next/link';
import { ArrowUpRight, BookOpen, Network, ShieldCheck } from 'lucide-react';
import { btnVariants } from '@/components/atlas/button';
/** Public entry: editorial, honest about the preview boundary. */
export default function Home() {
  return (
    <div className="min-h-dvh overflow-auto bg-canvas text-tx">
      <header className="flex items-center gap-2 px-5 py-4">
        <span
          aria-hidden="true"
          className="grid size-[22px] place-items-center rounded-[5px] bg-acb font-serif text-base font-semibold text-white"
        >
          A
        </span>
        <span className="font-serif text-xl font-medium">Atlas</span>
        <span className="flex-1" />
        <Link
          href="/app"
          className={btnVariants({ variant: 'outline', size: 'base' })}
        >
          {isLive() ? 'Open Atlas' : 'Open preview'}
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </header>
      <main className="mx-auto max-w-[760px] px-6 pt-[12vh] pb-20">
        <h1 className="font-serif text-[clamp(44px,8vw,80px)] leading-[1.02] font-medium tracking-[-0.01em]">
          Research is a journey.
          <br />
          <em className="text-tx2">Keep it connected.</em>
        </h1>
        <p className="mt-5 max-w-[540px] font-read text-[17px] leading-[1.7] text-tx2">
          A quiet home for your papers, writing, experiments and the
          conversations between them — with an assistant that knows the context.
        </p>
        <Link
          href="/app"
          className={btnVariants({
            variant: 'primary',
            size: 'cta',
            className: 'mt-8',
          })}
        >
          Explore the workspace
          <ArrowUpRight aria-hidden="true" />
        </Link>
        <p className="mt-4 text-xs text-tx3">
          {isLive()
            ? 'Create a verified account and a personal workspace. Research modules and AI are not connected yet.'
            : 'Phase 00.5A design preview. No account required; every workspace item is labeled sample data and nothing you type is stored.'}
        </p>
        <div className="mt-16 grid gap-6 border-t border-bd2 pt-8 sm:grid-cols-3">
          {[
            [
              BookOpen,
              'Built around research',
              'From the first question to the next discovery.',
            ],
            [
              Network,
              'One connected context',
              'Papers, notes, manuscripts and tasks, linked.',
            ],
            [
              ShieldCheck,
              'Private by design',
              'Tenant and project boundaries in the architecture.',
            ],
          ].map(([Icon, title, body]) => {
            const I = Icon as typeof BookOpen;
            return (
              <section key={title as string}>
                <I aria-hidden="true" className="mb-3 size-5 text-actx" />
                <h2 className="font-serif text-xl font-medium">
                  {title as string}
                </h2>
                <p className="mt-1 text-ctl text-tx2">{body as string}</p>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
