import { parseMessageBody, type MessageDto } from '@atlas/core';

/**
 * Renders a stored message as React text nodes, mention chips and http(s)
 * anchors only. No HTML or Markdown is ever interpreted; mention names come
 * from the server's per-viewer resolution (null after access was removed).
 */
export function MessageBody({
  body,
  mentions,
}: {
  body: string;
  mentions: MessageDto['mentions'];
}) {
  const names = new Map(mentions.map((m) => [m.id, m.name]));
  return (
    <>
      {parseMessageBody(body).map((segment, i) =>
        segment.type === 'mention' ? (
          <span
            key={i}
            data-mention={segment.profileId}
            className="rounded-[3px] bg-acs px-[3px] text-actx"
          >
            @{names.get(segment.profileId) ?? 'former member'}
          </span>
        ) : segment.type === 'link' ? (
          <a
            key={i}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="text-actx underline underline-offset-2"
          >
            {segment.text}
          </a>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  );
}
