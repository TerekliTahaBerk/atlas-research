'use client';
import { useState, type ReactNode } from 'react';
import { Info, LayoutGrid, List, Plus } from 'lucide-react';
import { Button } from '@atlas/ui/components/button';
import { Badge } from '@atlas/ui/components/badge';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogTrigger,
} from '@atlas/ui/components/dialog';
import { Input } from '@atlas/ui/components/input';
export function PreviewNotice({
  phase,
  children,
}: {
  phase?: string;
  children?: ReactNode;
}) {
  return (
    <p className="preview-notice">
      <Info aria-hidden="true" />
      <span>
        {children ??
          `Sample content · Planned for Phase ${phase}. Local interactions only; no service is connected.`}
      </span>
    </p>
  );
}
export function CapabilityButton({
  children,
  title,
  phase,
  variant = 'outline',
}: {
  children: ReactNode;
  title: string;
  phase: string;
  variant?: 'outline' | 'ghost' | 'default';
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm">
          {children}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            This action is a design preview. Phase {phase} will add the
            authorized service. Nothing has been created, sent, or saved.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
export function CreatePreview({ kind = 'document' }: { kind?: string }) {
  const [name, setName] = useState('');
  const [review, setReview] = useState(false);
  return (
    <Dialog
      onOpenChange={() => {
        setName('');
        setReview(false);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus data-icon="inline-start" />
          New {kind}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sketch a new {kind}</DialogTitle>
          <DialogDescription>
            Preview the creation flow. This draft stays in this dialog and is
            discarded when you close it.
          </DialogDescription>
        </DialogHeader>
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            setReview(true);
          }}
        >
          <label htmlFor={`new-${kind}`}>Name</label>
          <Input
            id={`new-${kind}`}
            value={name}
            required
            maxLength={120}
            onChange={(e) => {
              setName(e.target.value);
              setReview(false);
            }}
            placeholder={`Untitled ${kind}`}
          />
          <Button type="submit">Review draft</Button>
          {review ? (
            <div role="status" className="draft-review">
              <Badge variant="secondary">Draft only</Badge>
              <p>{name}</p>
              <p>
                No {kind} was created. Persistence arrives in a later phase.
              </p>
            </div>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function ViewToggle({
  value,
  onChange,
  options = ['Grid', 'List'],
}: {
  value: string;
  onChange: (value: string) => void;
  options?: readonly string[];
}) {
  return (
    <fieldset className="view-toggle">
      <legend className="sr-only">View layout</legend>
      {options.map((option) => (
        <label key={option} title={`${option} view`}>
          <input
            type="radio"
            name="view-layout"
            checked={value === option}
            onChange={() => onChange(option)}
          />
          <span>
            {option === 'Grid' || option === 'Board' ? (
              <LayoutGrid aria-hidden="true" />
            ) : (
              <List aria-hidden="true" />
            )}
            {option}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
export function SectionHeading({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {children}
    </div>
  );
}
