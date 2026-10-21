'use client';
import Link from 'next/link';
import {
  FileText,
  BookOpen,
  CircleCheck,
  UserRound,
  Folder,
  Hash,
  FlaskConical,
  Database,
  Image,
  TextSelect,
  Layers,
  X,
} from 'lucide-react';
import { type ContextReference, type EntityKind } from './contracts';
const icons = {
  document: FileText,
  paper: BookOpen,
  task: CircleCheck,
  person: UserRound,
  project: Folder,
  channel: Hash,
  manuscript: FileText,
  dataset: Database,
  figure: Image,
  experiment: FlaskConical,
  selection: TextSelect,
  workspace: Layers,
} satisfies Record<EntityKind, typeof FileText>;
export function ContextChip({
  reference,
  onRemove,
}: {
  reference: ContextReference;
  onRemove?: () => void;
}) {
  const Icon = icons[reference.kind];
  return (
    <span className="context-chip" title={reference.title}>
      <Icon aria-hidden="true" />
      {reference.href ? (
        <Link href={reference.href}>{reference.title}</Link>
      ) : (
        <span>{reference.title}</span>
      )}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${reference.title}`}
        >
          <X aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}
