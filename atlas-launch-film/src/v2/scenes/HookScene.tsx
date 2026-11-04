import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Stage } from '../../components/Stage';
import { researchQuestion } from '../../data/demoResearch';
import { useLayout } from '../../design/layout';
import { ease, mix, progress, seeded } from '../../design/motion';
import { color } from '../../design/tokens';
import { font } from '../../design/typography';
import { at } from '../storyboard';

/** Where the hook's point sits (shared with FragmentsScene). */
export const hookPoint = (portrait: boolean): [number, number] => (portrait ? [96, 700] : [176, 470]);

const FOCUS_FROM = 5; // index of "without" → underline "running out of memory?"

/**
 * 00:00–00:03 — THE HOOK. Frame 0 already holds a blue point; the question
 * unfurls from it in large editorial type, a hairline marks the problem,
 * then the words loosen into fragments and the point heads for centre.
 */
export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, portrait, pick } = useLayout();
  const mark = at('hook', 'hookMark');
  const release = at('hook', 'hookRelease');
  const words = researchQuestion.split(' ');
  const [px, py] = hookPoint(portrait);
  const size = pick(86, 80);
  const travel = progress(frame, release, release + 26, ease.inOut);
  const push = mix(1, 1.045, progress(frame, 0, 100, ease.soft));

  return (
    <Stage light={0.55}>
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: `${px}px ${py}px` }}>
        <div
          style={{
            position: 'absolute',
            left: pick(236, 96),
            top: pick(py - size * 0.58, py + 44),
            width: pick(1420, 900),
            fontFamily: font.sans,
            fontSize: size,
            fontWeight: 500,
            lineHeight: 1.08,
            letterSpacing: '-0.03em',
            color: color.tx,
          }}
        >
          {words.map((w, i) => {
            const t = progress(frame, -4 + i * 2.4, 14 + i * 2.4, ease.out);
            const focus = i >= FOCUS_FROM + 1;
            const dim = progress(frame, mark - 4, mark + 10, ease.out);
            const rel = progress(frame, release + i * 1.2, release + 22 + i * 1.2, ease.in);
            const dx = (seeded(i * 7 + 1) - 0.5) * 220 * rel;
            const dy = (seeded(i * 11 + 3) - 0.5) * 160 * rel;
            const u = progress(frame, mark + (i - FOCUS_FROM - 1) * 3, mark + 10 + (i - FOCUS_FROM - 1) * 3, ease.out);
            return (
              <React.Fragment key={i}>
                <span
                  style={{
                    position: 'relative',
                    display: 'inline-block',
                    opacity: t * (1 - rel) * (focus ? 1 : mix(1, 0.42, dim)),
                    filter: t < 1 || rel > 0 ? `blur(${(1 - t) * 9 + rel * 10}px)` : undefined,
                    transform: `translate(${dx}px, ${(1 - t) * 22 + dy}px)`,
                    letterSpacing: `${mix(0.04, 0, t)}em`,
                  }}
                >
                  {w}
                  {focus ? (
                    <span
                      style={{
                        position: 'absolute',
                        left: 0,
                        bottom: -size * 0.1,
                        height: 2,
                        width: `calc(${u * 100}% + ${i < words.length - 1 ? u * 0.27 : 0}em)`,
                        background: color.ac,
                        opacity: 0.9,
                      }}
                    />
                  ) : null}
                </span>
                {i < words.length - 1 ? ' ' : null}
              </React.Fragment>
            );
          })}
        </div>
      </AbsoluteFill>
      <Point frame={frame} from={[px, py]} to={[width / 2, height / 2]} travel={travel} />
    </Stage>
  );
};

const Point: React.FC<{ frame: number; from: [number, number]; to: [number, number]; travel: number }> = ({ frame, from, to, travel }) => {
  const appear = 0.65 + 0.35 * progress(frame, 0, 10, ease.out);
  const breathe = 0.5 + 0.5 * Math.sin(frame / 7);
  const x = mix(from[0], to[0], travel);
  const y = mix(from[1], to[1], travel) - Math.sin(Math.PI * travel) * 40;
  const d = mix(9, 12, appear) + travel * 2;
  return (
    <div
      style={{
        position: 'absolute',
        left: x - d / 2,
        top: y - d / 2,
        width: d,
        height: d,
        borderRadius: '50%',
        background: color.ac,
        opacity: appear,
        boxShadow: `0 0 ${16 + 10 * breathe}px rgba(91,141,239,${0.4 + 0.15 * breathe})`,
      }}
    />
  );
};
