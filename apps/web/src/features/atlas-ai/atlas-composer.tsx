'use client';
import { useRef, useState } from 'react';
import { ArrowUp, Plus, Sparkles } from 'lucide-react';
import { Button } from '@atlas/ui/components/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@atlas/ui/components/select';
import { ContextChip } from './context-chip';
import { EntityPicker, useEntityPicker } from './entity-picker';
import { type AssistantContext, type ContextReference } from './contracts';
const placeholders: Record<AssistantContext, string> = {
  global: 'Ask Atlas anything about your research...',
  research: 'Explore a research question...',
  paper: 'Ask about this paper...',
  document: 'Ask about this document...',
  tasks: 'Plan, organize, or create research tasks...',
  channel: 'Ask about this conversation...',
  manuscript: 'Write or improve your manuscript...',
  experiment: 'Explore this experiment...',
};
export function AtlasComposer({
  context = 'global',
  initialReferences = [],
  onSubmit,
  compact = false,
}: {
  context?: AssistantContext;
  initialReferences?: readonly ContextReference[];
  onSubmit: (prompt: string, references: ContextReference[]) => void;
  compact?: boolean;
}) {
  const [value, setValue] = useState('');
  const [references, setReferences] = useState<ContextReference[]>([
    ...initialReferences,
  ]);
  const input = useRef<HTMLTextAreaElement>(null);
  const picker = useEntityPicker({
    value,
    onChange: setValue,
    context,
    onAttach: (ref) =>
      setReferences((prev) =>
        prev.some((r) => r.id === ref.id) ? prev : [...prev, ref],
      ),
  });
  function submit() {
    if (value.trim()) {
      onSubmit(value.trim(), references);
      setValue('');
    }
  }
  return (
    <div className={compact ? 'atlas-composer compact' : 'atlas-composer'}>
      {!compact ? (
        <p className="composer-heading">
          <Sparkles aria-hidden="true" />
          What are you exploring today?
        </p>
      ) : null}
      {references.length ? (
        <div className="context-chips">
          {references.map((ref) => (
            <ContextChip
              key={ref.id}
              reference={ref}
              onRemove={() =>
                setReferences((prev) => prev.filter((r) => r.id !== ref.id))
              }
            />
          ))}
        </div>
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="composer-input-wrap">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Attach context"
            type="button"
            onClick={() => {
              picker.change(
                `${value}${value && !value.endsWith(' ') ? ' ' : ''}@`,
              );
              input.current?.focus();
            }}
          >
            <Plus aria-hidden="true" />
          </Button>
          <textarea
            ref={input}
            aria-label="Ask Atlas"
            rows={compact ? 2 : 1}
            placeholder={placeholders[context]}
            value={value}
            {...picker.inputProps}
            onChange={(e) => picker.change(e.target.value)}
            onKeyDown={(e) => {
              picker.onKeyDown(e);
              if (!e.defaultPrevented && e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <Button
            type="submit"
            size="icon-sm"
            aria-label="Preview response"
            disabled={!value.trim()}
          >
            <ArrowUp aria-hidden="true" />
          </Button>
        </div>
        <EntityPicker picker={picker} />
        <div className="composer-footer">
          <span>
            {context === 'global' ? 'Sample project' : `${context} context`}
          </span>
          <Select defaultValue="grounded">
            <SelectTrigger aria-label="AI mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="grounded">Grounded · preview</SelectItem>
                <SelectItem value="explore">Explore · preview</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <span className="composer-hint">@ context · / commands</span>
        </div>
      </form>
    </div>
  );
}
