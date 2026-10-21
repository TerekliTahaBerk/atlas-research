'use client';
import {
  createContext,
  useContext,
  useRef,
  useState,
  useEffect,
  useCallback,
  useId,
  type ReactNode,
} from 'react';
import { X, Sparkles, ArrowDownLeft } from 'lucide-react';
import { Button } from '@atlas/ui/components/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from '@atlas/ui/components/select';
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from '@atlas/ui/components/alert';
import { AtlasComposer } from './atlas-composer';
import { AIResponse } from './ai-response';
import { ContextChip } from './context-chip';
import {
  type AssistantContext,
  type AssistantState,
  type ContextReference,
  entitySamples,
} from './contracts';
type AssistantRequest = {
  prompt?: string;
  context?: AssistantContext;
  references?: ContextReference[];
};
const AtlasContext = createContext<{
  openAssistant: (request?: AssistantRequest) => void;
  isOpen: boolean;
  closeAssistant: () => void;
} | null>(null);
export function useAtlas() {
  const context = useContext(AtlasContext);
  if (!context) throw new Error('Atlas UI requires AtlasProvider');
  return context;
}
export function AtlasProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<AssistantRequest | null>(null);
  const focusReturn = useRef<HTMLElement | null>(null);
  function openAssistant(next: AssistantRequest = {}) {
    if (!request)
      focusReturn.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    setRequest(next);
  }
  const closeAssistant = useCallback(() => {
    setRequest(null);
    focusReturn.current?.focus();
  }, []);
  return (
    <AtlasContext.Provider
      value={{ openAssistant, isOpen: Boolean(request), closeAssistant }}
    >
      <div
        className={
          request ? 'assistant-layout has-assistant' : 'assistant-layout'
        }
      >
        <div className="primary-workspace">{children}</div>
        {request ? (
          <AssistantPanel
            key={`${request.context}-${request.prompt}-${request.references?.map((r) => r.id).join(',')}`}
            request={request}
            onClose={closeAssistant}
          />
        ) : null}
      </div>
    </AtlasContext.Provider>
  );
}
const stateLabels: Partial<Record<AssistantState, string>> = {
  focused: 'Focused composer',
  expanded: 'Expanded composer',
  'context-attached': 'Context attached',
  'search-pending': 'Search pending',
  'searching-sources': 'Searching sources',
  'reading-documents': 'Reading documents',
  generating: 'Generating response',
  answer: 'Sample cited answer',
  approval: 'Awaiting action approval',
  error: 'Error',
  cancelled: 'Cancelled',
};
export function AssistantExperience({
  request = {},
}: {
  request?: AssistantRequest;
}) {
  const stateId = useId();
  const experienceRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<AssistantState>(
    request.prompt ? 'answer' : 'expanded',
  );
  const [prompt, setPrompt] = useState(request.prompt ?? '');
  const [references, setReferences] = useState(request.references ?? []);
  const [action, setAction] = useState('Create task');
  const context = request.context ?? 'global';
  return (
    <div className="assistant-experience" ref={experienceRef}>
      <p className="muted">
        Interactive design preview. No model, search, or tool calls.
      </p>
      <div className="state-control">
        <label htmlFor={stateId}>Preview state</label>
        <Select
          value={state}
          onValueChange={(next) => {
            if (Object.hasOwn(stateLabels, next)) {
              setState(next as AssistantState);
              if (next === 'context-attached' && references.length === 0) {
                const sample = entitySamples[0];
                if (sample) setReferences([sample]);
              }
              if (next === 'focused')
                requestAnimationFrame(() =>
                  experienceRef.current?.querySelector('textarea')?.focus(),
                );
            }
          }}
        >
          <SelectTrigger id={stateId} aria-label="Assistant preview state">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {Object.entries(stateLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
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
      <AtlasComposer
        compact
        context={context}
        onSubmit={(next, refs) => {
          setPrompt(next);
          setReferences((prev) => [
            ...prev,
            ...refs.filter((r) => !prev.some((p) => p.id === r.id)),
          ]);
          setState('answer');
        }}
      />
      {prompt ? <div className="user-prompt">{prompt}</div> : null}
      {state === 'answer' ? (
        <AIResponse
          onRetry={() => setState('search-pending')}
          onAction={(next) => {
            setAction(next);
            setState('approval');
          }}
        />
      ) : null}
      {[
        'search-pending',
        'searching-sources',
        'reading-documents',
        'generating',
      ].includes(state) ? (
        <div className="progress-preview" role="status">
          <Sparkles aria-hidden="true" />
          <h3>{stateLabels[state]} · preview</h3>
          <p>This is a selectable visual state. No operation is running.</p>
          <progress
            aria-label="Illustrative progress"
            value={state === 'generating' ? 75 : 30}
            max={100}
          />
          <div className="button-row">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setState('cancelled')}
            >
              Cancel preview
            </Button>
            <Button size="sm" onClick={() => setState('answer')}>
              Show sample answer
            </Button>
          </div>
        </div>
      ) : null}
      {state === 'approval' ? (
        <Alert>
          <ArrowDownLeft aria-hidden="true" />
          <AlertTitle>{action} · proposed action</AlertTitle>
          <AlertDescription>
            <p>
              Target: Sample project. Review the source and content before a
              future authorized write.
            </p>
            <p>Preview only: this action cannot execute.</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setState('answer')}
            >
              Dismiss proposal
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {state === 'error' ? (
        <Alert variant="destructive">
          <AlertTitle>Example provider unavailable</AlertTitle>
          <AlertDescription>
            <p>
              No real request failed. This demonstrates a recoverable error
              without provider details.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setState('expanded')}
            >
              Retry composer
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {state === 'cancelled' ? (
        <p role="status" className="progress-preview">
          Preview cancelled. No action was performed.
        </p>
      ) : null}
      {['focused', 'expanded', 'context-attached'].includes(state) ? (
        <div className="assistant-welcome">
          <Sparkles aria-hidden="true" />
          <h3>A thought partner, close at hand.</h3>
          <p>
            Attach a sample paper with @, explore commands with /, or submit a
            prompt to inspect the same prewritten answer.
          </p>
        </div>
      ) : null}
    </div>
  );
}
function AssistantPanel({
  request,
  onClose,
}: {
  request: AssistantRequest;
  onClose: () => void;
}) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    function handle(event: KeyboardEvent) {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !document.querySelector('[role="dialog"], [role="listbox"]')
      ) {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose]);
  return (
    <aside className="assistant-panel" aria-label="Atlas AI assistant">
      <header>
        <h2>
          <Sparkles aria-hidden="true" />
          Atlas AI
        </h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close Atlas AI"
          ref={close}
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </Button>
      </header>
      <AssistantExperience request={request} />
    </aside>
  );
}
