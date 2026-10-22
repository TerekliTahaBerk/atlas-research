'use client';
import { Crumb, Topbar } from '@/features/shell/topbar';
const frames = [
  { src: '/app/home', title: 'Home', caption: 'Home' },
  {
    src: '/app/projects/sample/documents?doc=d1',
    title: 'Document',
    caption: 'Document with the format bar',
  },
  {
    src: '/app/projects/sample/documents?doc=d1&atlas=panel',
    title: 'Atlas bottom sheet',
    caption: 'Atlas as a bottom sheet',
  },
  {
    src: '/app/projects/sample/manuscripts',
    title: 'Manuscript',
    caption: 'Manuscript, editor-only below 900px',
  },
] as const;
const W = 390;
const H = 844;
const SCALE = 0.78;
/**
 * Mobile QA view (prototype "mobile"). Each frame is the real application
 * rendered in a 390×844 viewport — not a screenshot — scaled to fit.
 */
export function MobileScreens() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar>
        <Crumb title="Mobile · 390 × 844" as="span" />
      </Topbar>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="px-8 pt-10 pb-20 max-sm:px-4">
          <h1 className="mb-1.5 font-serif text-[34px] leading-[1.1] font-medium">
            Atlas on a phone
          </h1>
          <p className="mb-7 max-w-[620px] text-ui text-tx2">
            Reading, light writing and asking Atlas on the go. Below 900px the
            sidebar becomes a drawer, side panels become sheets and the composer
            stacks under the top bar. These frames load the live routes at phone
            size.
          </p>
          <div className="flex flex-wrap items-start gap-7">
            {frames.map((f) => (
              <figure
                key={f.src}
                className="flex flex-col items-center gap-2.5"
              >
                <div
                  className="overflow-hidden rounded-[40px] border-[10px] border-[#0d0e0d] bg-canvas shadow-[0_20px_50px_rgb(0_0_0/0.35)]"
                  style={{ width: W * SCALE + 20, height: H * SCALE + 20 }}
                >
                  <iframe
                    src={f.src}
                    title={`${f.title} at 390 by 844`}
                    loading="lazy"
                    width={W}
                    height={H}
                    className="origin-top-left border-0"
                    style={{ transform: `scale(${SCALE})` }}
                  />
                </div>
                <figcaption className="text-xs text-tx3">
                  {f.caption}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
