import { useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { AiAssistantContext } from '../../shared/protocol-ai.js';
import { ExternalLink } from './ExternalLink.js';

type AiAssistantSourcesProps = {
  chatSources: NonNullable<AiAssistantContext['sources']>;
  webSources: NonNullable<AiAssistantContext['webSources']>;
  onOpenSource?: (messageId: string) => Promise<boolean>;
};

export function AiAssistantSources({ chatSources, webSources, onOpenSource }: AiAssistantSourcesProps) {
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
  const requestSequence = useRef(0);
  if (!chatSources.length && !webSources.length) return null;
  return (
    <div className="mt-2.5 flex flex-col items-start gap-2 text-xs">
      {chatSources.length > 0 ? (
        <details className="max-w-full">
          <summary className="w-fit cursor-pointer list-none rounded-md border border-white/15 px-2 py-0.5 text-muted-foreground hover:border-white/30 hover:text-foreground focus-visible:outline focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
            {chatSources.length === 1 ? 'Source' : `${chatSources.length} chat sources`}
          </summary>
          <ul className="mt-2 space-y-2 border-l border-white/15 pl-2.5 text-[12px] leading-[18px]">
            {chatSources.map(({ label, message }) => (
              <li key={label}>
                <p className="font-medium text-muted-foreground">
                  {message.speakerNick ?? message.nick ?? 'Unknown'} · <time dateTime={new Date(message.ts).toISOString()}>
                    {new Date(message.ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </time>
                </p>
                <blockquote className="whitespace-pre-wrap break-words">{message.body}</blockquote>
                {onOpenSource ? <button type="button" className="mt-1 text-primary underline underline-offset-2"
                  onClick={async () => {
                    const request = ++requestSequence.current;
                    setUnavailableMessage(null);
                    let opened = false;
                    try { opened = await onOpenSource(message.id); } catch { /* Keep the excerpt visible. */ }
                    if (!opened && request === requestSequence.current) setUnavailableMessage(label);
                  }}>Open message</button> : null}
                {unavailableMessage === label ? <p role="status" className="text-muted-foreground">The original message is unavailable.</p> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {webSources.length === 1 ? <WebSource source={webSources[0]}>Web source</WebSource> : null}
      {webSources.length > 1 ? (
        <details className="max-w-full">
          <summary className="cursor-pointer text-primary">{webSources.length} web sources</summary>
          <ul className="mt-1 space-y-1">
            {webSources.map(source => <li key={source.label}><WebSource source={source}>{source.title}</WebSource></li>)}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function WebSource({ source, children }: { source: NonNullable<AiAssistantContext['webSources']>[number]; children: string }) {
  return <ExternalLink href={source.url} title={source.title} target="_blank" rel="noopener noreferrer"
    className="inline-flex items-baseline gap-1.5 text-primary underline decoration-primary/50 underline-offset-2 hover:decoration-primary">
    <ArrowUpRight aria-hidden className="size-3 shrink-0 self-center" />
    <span className="break-words">{children}</span>
  </ExternalLink>;
}
