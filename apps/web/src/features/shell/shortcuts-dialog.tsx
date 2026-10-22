'use client';
import { X } from 'lucide-react';
import {
  Modal,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalTitle,
} from '@/components/atlas/overlay';
const groups = [
  {
    title: 'Global',
    keys: [
      ['⌘ K', 'Search everything'],
      ['⌘ J', 'Ask Atlas (focus mode)'],
      ['⌘ \\', 'Toggle sidebar'],
      ['?', 'Keyboard shortcuts'],
      ['Esc', 'Close menu, popover or focus mode'],
    ],
  },
  {
    title: 'Atlas composer',
    keys: [
      ['@', 'Reference a paper, doc, task or person'],
      ['/', 'Commands: /summarize /cite /latex …'],
      ['↑ ↓', 'Move through menu'],
      ['↵', 'Pick / send'],
      ['Esc', 'Stop the sample sequence, then close'],
    ],
  },
  {
    title: 'Manuscript',
    keys: [
      ['Click line number', 'Jump to PDF location'],
      ['Click PDF paragraph', 'Jump to source line'],
    ],
  },
] as const;
export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-h-[calc(100vh-48px)] w-[min(560px,calc(100vw-32px))] overflow-auto rounded-3xl px-[22px] py-5">
        <div className="mb-3.5 flex items-center">
          <ModalTitle className="flex-1 font-serif text-[26px] font-medium">
            Keyboard shortcuts
          </ModalTitle>
          <ModalClose
            aria-label="Close"
            className="grid size-7 place-items-center rounded-md text-tx2 hover:bg-hov"
          >
            <X aria-hidden="true" className="size-4" />
          </ModalClose>
        </div>
        <ModalDescription className="sr-only">
          Shortcuts available in the Atlas preview.
        </ModalDescription>
        {groups.map((g) => (
          <section key={g.title}>
            <h3 className="mt-3 mb-1 text-[11.5px] text-tx3">{g.title}</h3>
            <dl>
              {g.keys.map(([key, description]) => (
                <div
                  key={key + description}
                  className="flex h-8 items-center gap-3 border-b border-bd2 text-ui"
                >
                  <dt className="sr-only">{key}</dt>
                  <dd className="flex-1 text-tx2">{description}</dd>
                  <span
                    aria-hidden="true"
                    className="rounded-sm border border-bd2 bg-el px-[7px] py-0.5 font-mono text-[11.5px]"
                  >
                    {key}
                  </span>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </ModalContent>
    </Modal>
  );
}
