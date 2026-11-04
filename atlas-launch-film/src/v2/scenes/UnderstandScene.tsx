import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { PaperReader } from '../../components/PaperReader';
import { Stage } from '../../components/Stage';
import { highlightedSentence } from '../../data/demoResearch';
import { useLayout } from '../../design/layout';
import { ease, mix, progress } from '../../design/motion';
import { Layer, Rig, lerpRect, project, sampleRig, type Rect } from '../../design/rig';
import { color } from '../../design/tokens';
import { font } from '../../design/typography';
import { NOTE, PAGE, pick as pickA } from '../anchors';
import { AskCard, QUOTE_SLOT } from '../components/AskCard';
import { EditorialTitle } from '../components/EditorialTitle';
import { NOTE_H, NOTE_W, NoteCard } from '../components/NoteCard';
import { PaperPage, SENTENCE_TOP_Q } from '../components/PaperPage';
import { Window } from '../components/Window';
import { at } from '../storyboard';

/**
 * 00:22–00:31 — UNDERSTAND. The highlighted sentence lifts off the page,
 * travels into Ask Atlas as quoted evidence (tethered to its source by a
 * hairline), and the verified answer condenses into a research note.
 */
export const UnderstandScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { portrait, pick } = useLayout();
  const O: [number, number] = [width / 2, height / 2];
  const page = pickA(PAGE, portrait);
  const q = page.w / 100;

  const hl = at('understand', 'highlight');
  const menu = at('understand', 'selectMenu');
  const ask = at('understand', 'askAtlas');
  const lift = at('understand', 'liftEvidence');
  const stream = at('understand', 'answerStream');
  const verified = at('understand', 'verified');
  const save = at('understand', 'saveNote');

  const keys = [
    { at: 0, s: 1, x: 0, y: 0, focus: 1 },
    { at: hl + 10, s: pick(1.1, 1.06), x: pick(40, 0), y: pick(60, 20), focus: 1 },
    { at: lift, s: pick(1.1, 1.06), x: pick(40, 0), y: pick(60, 20), focus: 1 },
    { at: lift + 50, s: pick(1.02, 1.0), x: pick(-30, 0), y: pick(40, 10), focus: 1 },
    { at: save, s: pick(1.0, 1.0), x: pick(-40, 0), y: pick(30, 10), focus: 1 },
    { at: save + 36, s: 0.94, x: pick(-60, 0), y: pick(20, 0), focus: 2.2 },
    { at: 290, s: 0.93, x: pick(-60, 0), y: pick(20, 0), focus: 2.4 },
  ];
  const cam = sampleRig(keys, frame);

  // Sentence strip geometry (page space at rest → screen via the rig).
  const sTop = page.y + SENTENCE_TOP_Q * q;
  const sLeft = page.x + 9 * q;
  const sW = highlightedSentence.length * 1.85 * q * 0.47;
  const sH = 1.85 * q * 1.55;
  const [ax, ay] = project(cam, 1, O, [sLeft, sTop]);
  const Sp = cam.s;
  const stripFrom: Rect = { x: ax, y: ay, w: sW * Sp, h: sH * Sp };

  // Card is laid out at card.w / sc and magnified for laptop-size legibility.
  const sc = pick(1.22, 1.3);
  const card = portrait ? { x: 60, y: 1060, w: 960 } : { x: 1150, y: 120, w: 700 };
  const slot: Rect = { x: card.x + QUOTE_SLOT.x * sc, y: card.y + (QUOTE_SLOT.y + 8) * sc, w: card.w - 40 * sc, h: (QUOTE_SLOT.h - 16) * sc };
  const raise = progress(frame, lift, lift + 12, ease.out);
  const travel = progress(frame, lift + 8, lift + 40, ease.inOut);
  const strip = lerpRect(stripFrom, slot, travel);

  const askS = {
    card: progress(frame, lift + 14, lift + 34, ease.out) * (1 - progress(frame, save + 6, save + 22, ease.inOut)),
    quoteIn: progress(frame, lift + 38, lift + 46),
    ask: progress(frame, lift + 44, lift + 58, ease.out),
    think: progress(frame, lift + 54, stream, (t) => t),
    answer: progress(frame, stream, verified - 4, (t) => t),
    verified: progress(frame, verified, verified + 14, ease.out),
    save: progress(frame, save, save + 8, (t) => t),
  };

  const n = pickA(NOTE, portrait);
  const noteT = progress(frame, save + 4, save + 36, ease.inOut);
  const noteFrom: Rect = { x: card.x, y: card.y + 140 * sc, w: card.w, h: 300 };
  const noteTo: Rect = { x: n.cx - n.w / 2, y: n.cy - NOTE_H(portrait) / 2, w: n.w, h: 300 };
  const note = lerpRect(noteFrom, noteTo, noteT);

  const link = progress(frame, lift + 40, lift + 56, ease.out) * (1 - progress(frame, save, save + 14));
  const [hx, hy] = project(cam, 1, O, [sLeft + sW, sTop + sH / 2]);

  return (
    <Stage vignette={0.35}>
      <Rig keys={keys}>
        <Layer depth={0.7} dof={9}>
          <div style={{ opacity: 0.14 }}>
            <Window active="reader">
              <PaperReader s={{ select: 0, annotate: 0, menu: 0, askPress: 0, scroll: 0 }} narrow={portrait} />
            </Window>
          </div>
        </Layer>
        <Layer depth={1} dof={3.5}>
          <div style={{ position: 'absolute', left: page.x, top: page.y }}>
            <PaperPage
              width={page.w}
              s={{
                select: progress(frame, hl, hl + 26, ease.inOut),
                annotate: progress(frame, save, save + 20, ease.inOut),
                menu: Math.min(progress(frame, menu, menu + 8, ease.out), 1 - progress(frame, ask + 6, ask + 14)),
                askPress: progress(frame, ask, ask + 10, (t) => t),
                lifted: raise * (1 - progress(frame, save, save + 20)),
              }}
              style={{ boxShadow: '0 50px 120px rgba(0,0,0,.6)' }}
            />
          </div>
        </Layer>
      </Rig>
      {link > 0.01 ? (
        <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
          <path
            d={`M ${hx} ${hy} C ${hx + 140} ${hy}, ${slot.x - 140} ${slot.y + slot.h / 2}, ${slot.x - 4} ${slot.y + slot.h / 2}`}
            stroke={color.actx}
            strokeWidth={1.5}
            fill="none"
            opacity={0.85 * link}
            strokeDasharray="1600"
            strokeDashoffset={1600 * (1 - link)}
          />
          <circle cx={hx} cy={hy} r={3.5} fill={color.actx} opacity={link} />
        </svg>
      ) : null}
      {askS.card > 0.01 ? (
        <div style={{ position: 'absolute', left: card.x, top: card.y, transform: `scale(${sc})`, transformOrigin: '0 0' }}>
          <AskCard width={card.w / sc} s={askS} />
        </div>
      ) : null}
      {frame >= lift && travel < 1 ? (
        <div
          style={{
            position: 'absolute',
            left: strip.x,
            top: strip.y - raise * 10,
            width: strip.w,
            height: strip.h,
            borderRadius: 6,
            background: `rgb(${mix(250, 38, travel)},${mix(246, 38, travel)},${mix(232, 37, travel)})`,
            boxShadow: `0 ${18 * raise}px ${46 * raise}px rgba(0,0,0,${0.45 * raise})`,
            display: 'flex',
            alignItems: 'center',
            overflow: 'hidden',
            transform: `scale(${1 + 0.04 * raise * (1 - travel)})`,
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: 0,
              whiteSpace: 'nowrap',
              fontFamily: font.paper,
              fontSize: 1.85 * q * Sp,
              color: '#1b1b1b',
              background: 'rgba(108,121,224,.3)',
              opacity: 1 - progress(travel, 0.2, 0.6),
              transformOrigin: '0 50%',
              transform: `scale(${strip.w / (sW * Sp)})`,
            }}
          >
            {highlightedSentence}
          </span>
          <span style={{ position: 'absolute', left: 12 * sc, right: 6, fontFamily: font.sans, fontSize: 15 * sc, lineHeight: 1.45, color: color.tx2, opacity: progress(travel, 0.5, 0.9) }}>
            “{highlightedSentence}”
          </span>
        </div>
      ) : null}
      {frame >= save + 4 ? (
        <div style={{ position: 'absolute', left: note.x, top: note.y, opacity: progress(frame, save + 4, save + 14) }}>
          <div style={{ width: NOTE_W, transform: `scale(${note.w / NOTE_W})`, transformOrigin: '0 0' }}>
            <NoteCard width={NOTE_W} glow={progress(frame, save + 24, save + 40) * (1 - progress(frame, save + 44, save + 60))} />
          </div>
        </div>
      ) : null}
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <EditorialTitle
          text="Go beyond reading."
          from={at('understand', 'readTitle')}
          exitAt={lift - 6}
          size={pick(80, 76)}
          style={portrait ? { left: 90, right: 90, top: 250 } : { left: 1200, top: 300, width: 600 }}
        />
      </AbsoluteFill>
    </Stage>
  );
};
