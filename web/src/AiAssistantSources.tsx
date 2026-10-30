import type { AiAssistantContext } from '../../shared/protocol-ai.js';

export function AiAssistantSources({ context, sourcePrefix }: { context: AiAssistantContext; sourcePrefix: string }) {
  return (
    <details className="mt-2 border-t border-white/10 pt-2 text-[11px] text-muted-foreground">
      <summary className="cursor-pointer">
        Sources ({context.sources?.length ?? 0}){context.coverage?.truncated ? ' · Incomplete history' : ''}
      </summary>
      {context.coverage?.totalMessages !== undefined ? <p className="mt-2">
        {context.coverage.inspectedMessages} messages used · {context.coverage.totalMessages} saved
      </p> : null}
      {context.coverage?.firstTs != null && context.coverage.lastTs != null ? <p>
        Saved dates: {new Date(context.coverage.firstTs).toLocaleDateString()} – {new Date(context.coverage.lastTs).toLocaleDateString()}
      </p> : null}
      {context.coverage?.researchLimited ? <p>Search limit reached. Some questions may remain unresolved.</p> : null}
      <p className="mt-2">{context.coverage?.description}</p>
      {context.coverage?.truncated ? <p>Some messages were omitted or shortened.</p> : null}
      <p>These conversation excerpts were sent to OpenAI for this answer.</p>
      <ol className="mt-2 space-y-2">
        {context.sources?.map(({ label, message }) => (
          <li key={label} id={`${sourcePrefix}-${label}`}>
            <span className="font-medium">[{label}] {message.speakerNick ?? message.nick ?? 'unknown'} · {new Date(message.ts).toLocaleString()}</span>
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
          </li>
        ))}
      </ol>
    </details>
  );
}
