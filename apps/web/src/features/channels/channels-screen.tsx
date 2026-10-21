'use client';
import { useRef, useState } from 'react';
import {
  Hash,
  LockKeyhole,
  Pin,
  MessageSquare,
  SmilePlus,
  Paperclip,
  ArrowUp,
  Sparkles,
} from 'lucide-react';
import { Button } from '@atlas/ui/components/button';
import { PageHeader } from '@/components/page-header';
import { PreviewNotice, CapabilityButton } from '@/features/preview/primitives';
import { ContextChip } from '@/features/atlas-ai/context-chip';
import {
  EntityPicker,
  useEntityPicker,
} from '@/features/atlas-ai/entity-picker';
import { useAtlas } from '@/features/atlas-ai/atlas-provider';
import { type ContextReference } from '@/features/atlas-ai/contracts';
interface Message {
  id: string;
  author: string;
  initials: string;
  body: string;
  references?: ContextReference[];
  local?: boolean;
}
const sampleMessages: readonly Message[] = [
  {
    id: 'message-1',
    author: 'Alex Morgan',
    initials: 'AM',
    body: 'I’ve added a starting point for our reading group. Could we focus on how the authors define researcher agency?',
    references: [
      {
        id: 'paper-collaboration',
        kind: 'paper',
        title: 'Designing for thoughtful human–AI collaboration',
        href: '/app/projects/sample/library',
      },
    ],
  },
  {
    id: 'message-2',
    author: 'Jamie Lee',
    initials: 'JL',
    body: 'That connects nicely with our literature review. I’m keeping a list of questions that the evidence doesn’t yet answer.',
    references: [
      {
        id: 'document-review',
        kind: 'document',
        title: 'Literature review',
        href: '/app/projects/sample/documents',
      },
    ],
  },
  {
    id: 'message-3',
    author: 'Sam Rivera',
    initials: 'SR',
    body: 'Let’s separate what the paper shows from what we’d like to test next. The methodology task could capture the next step.',
    references: [
      {
        id: 'task-method',
        kind: 'task',
        title: 'Draft methodology section',
        href: '/app/projects/sample/tasks',
      },
    ],
  },
];
export function ChannelsScreen() {
  const [channel, setChannel] = useState('reading-group');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [references, setReferences] = useState<ContextReference[]>([]);
  const [reactions, setReactions] = useState<string[]>([]);
  const [thread, setThread] = useState<Message | null>(null);
  const [reply, setReply] = useState('');
  const [replies, setReplies] = useState<Record<string, string[]>>({});
  const serial = useRef(0);
  const { openAssistant } = useAtlas();
  const picker = useEntityPicker({
    value: draft,
    onChange: setDraft,
    context: 'channel',
    onAttach: (ref) =>
      setReferences((prev) =>
        prev.some((r) => r.id === ref.id) ? prev : [...prev, ref],
      ),
  });
  function addMessage() {
    if (!draft.trim()) return;
    if (draft.includes('@Atlas')) {
      openAssistant({
        context: 'channel',
        prompt: draft,
        references: [
          { id: 'channel-reading', kind: 'channel', title: channel },
          ...references,
        ],
      });
      return;
    }
    serial.current += 1;
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${serial.current}`,
        author: 'Preview visitor',
        initials: 'PV',
        body: draft,
        references,
        local: true,
      },
    ]);
    setDraft('');
    setReferences([]);
  }
  const visible =
    channel === 'reading-group' ? [...sampleMessages, ...messages] : [];
  return (
    <div>
      <PageHeader
        title="Channels"
        description="Keep the conversation close to the research."
      />
      <PreviewNotice phase="05">
        Fictional conversation · messages and reactions are local
        demonstrations. No one else can receive them.
      </PreviewNotice>
      <div className="channels-layout">
        <aside className="channel-rail" aria-label="Channels">
          <h2>Sample project</h2>
          {['reading-group', 'general', 'methods'].map((name) => (
            <button
              key={name}
              aria-current={channel === name ? 'page' : undefined}
              onClick={() => {
                setChannel(name);
                setThread(null);
              }}
            >
              <Hash aria-hidden="true" />
              {name}
              {name === 'reading-group' ? (
                <span
                  className="unread-dot"
                  aria-label="Sample unread activity"
                />
              ) : null}
            </button>
          ))}
          <h3>Restricted</h3>
          <CapabilityButton title="Private channel" phase="05">
            <LockKeyhole data-icon="inline-start" />
            team-planning
          </CapabilityButton>
          <p className="metadata">
            Sample presence
            <br />
            AM · JL · SR · illustrative only
          </p>
        </aside>
        <section className="channel-conversation">
          <header className="channel-header">
            <h2>
              <Hash aria-hidden="true" />
              {channel}
            </h2>
            <CapabilityButton title="Pinned research references" phase="05">
              <Pin data-icon="inline-start" />
              Pinned
            </CapabilityButton>
          </header>
          <div className="messages">
            <p className="conversation-date">
              Sample discussion · no live activity
            </p>
            {visible.map((message) => (
              <article className="channel-message" key={message.id}>
                <span className="avatar-initials">{message.initials}</span>
                <div>
                  <header>
                    <strong>{message.author}</strong>
                    <small>
                      {message.local ? 'Local draft' : 'Sample researcher'}
                    </small>
                  </header>
                  <p>{message.body}</p>
                  <div className="context-chips">
                    {message.references?.map((ref) => (
                      <ContextChip reference={ref} key={ref.id} />
                    ))}
                  </div>
                  <div className="message-actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-pressed={reactions.includes(message.id)}
                      onClick={() =>
                        setReactions((prev) =>
                          prev.includes(message.id)
                            ? prev.filter((id) => id !== message.id)
                            : [...prev, message.id],
                        )
                      }
                    >
                      <SmilePlus data-icon="inline-start" />
                      {reactions.includes(message.id)
                        ? '1 local reaction'
                        : 'React'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setThread(message)}
                    >
                      <MessageSquare data-icon="inline-start" />
                      Thread {replies[message.id]?.length || ''}
                    </Button>
                  </div>
                </div>
              </article>
            ))}
            {!visible.length ? (
              <div className="assistant-welcome">
                <Hash aria-hidden="true" />
                <h3>A little room for a new conversation.</h3>
                <p>
                  This sample channel has no messages. Return to reading-group
                  to try local composition.
                </p>
              </div>
            ) : null}
          </div>
          {channel === 'reading-group' ? (
            <form
              className="message-composer"
              onSubmit={(e) => {
                e.preventDefault();
                addMessage();
              }}
            >
              <div className="context-chips">
                {references.map((ref) => (
                  <ContextChip
                    key={ref.id}
                    reference={ref}
                    onRemove={() =>
                      setReferences((prev) =>
                        prev.filter((r) => r.id !== ref.id),
                      )
                    }
                  />
                ))}
              </div>
              <textarea
                aria-label="Local channel message"
                rows={2}
                value={draft}
                {...picker.inputProps}
                onChange={(e) => picker.change(e.target.value)}
                onKeyDown={picker.onKeyDown}
                placeholder="Write a local message… @ for research references"
              />
              <EntityPicker picker={picker} />
              <div className="button-row">
                <CapabilityButton title="Attach a file" phase="05">
                  <Paperclip data-icon="inline-start" />
                  Attach
                </CapabilityButton>
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setDraft('@Atlas summarize this sample discussion');
                    openAssistant({
                      context: 'channel',
                      prompt: 'Summarize this sample discussion',
                      references: [
                        {
                          id: 'channel-reading',
                          kind: 'channel',
                          title: channel,
                        },
                      ],
                    });
                  }}
                >
                  <Sparkles data-icon="inline-start" />
                  @Atlas
                </Button>
                <Button size="sm" type="submit" disabled={!draft.trim()}>
                  <ArrowUp data-icon="inline-start" />
                  Add local message
                </Button>
              </div>
              <small>Visible here only. Resets when you leave.</small>
            </form>
          ) : null}
        </section>
        {thread ? (
          <aside className="thread-panel" aria-label="Message thread">
            <header>
              <h3>Thread</h3>
              <Button variant="ghost" size="sm" onClick={() => setThread(null)}>
                Close thread
              </Button>
            </header>
            <p>{thread.body}</p>
            {replies[thread.id]?.map((text, i) => (
              <p className="local-reply" key={`${thread.id}-${i}`}>
                Preview visitor · {text}
              </p>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (reply.trim()) {
                  setReplies((prev) => ({
                    ...prev,
                    [thread.id]: [...(prev[thread.id] ?? []), reply],
                  }));
                  setReply('');
                }
              }}
            >
              <label htmlFor="thread-reply">Local reply</label>
              <textarea
                id="thread-reply"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
              <Button size="sm" type="submit" disabled={!reply.trim()}>
                Add local reply
              </Button>
            </form>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
