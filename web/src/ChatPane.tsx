import type { RefObject } from 'react';
import { Plug2, PowerOff, RefreshCcw, SendHorizonal, X } from 'lucide-react';
import type { BufferState, ChatMessage, NetworkProfile } from '../../shared/protocol.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card } from '@/components/ui/card.js';
import { Input } from '@/components/ui/input.js';
import { cn } from '@/lib/utils.js';
import { FormattedMessageText } from './FormattedMessageText.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import type { WorkspaceView } from './workspace.js';

type ChatPaneProps = {
  workspace: WorkspaceView;
  selectedMessages: ChatMessage[];
  draft: string;
  messageDisplayMode: MessageDisplayMode;
  scrollRef: RefObject<HTMLDivElement | null>;
  onDraftChange: (value: string) => void;
  onRecallOlderDraft: () => void;
  onRecallNewerDraft: () => void;
  onSend: () => Promise<void>;
  onReconnect: (network: NetworkProfile) => void;
  onDisconnect: (networkId: string) => void;
  onCloseConnection: (network: NetworkProfile) => void;
  onCloseChannel: (networkId: string, channel: string) => void;
  onCloseBuffer: (buffer: BufferState) => void;
  onOpenMentionedChannel: (channel: string) => void;
};

export function ChatPane(props: ChatPaneProps) {
  const { selectedBuffer, selectedChannel, selectedNetwork } = props.workspace;
  const isServerBuffer =
    props.workspace.mode === 'server-connected' ||
    props.workspace.mode === 'server-connecting' ||
    props.workspace.mode === 'server-offline';
  const renderBlocks = buildRenderBlocks(props.selectedMessages, isServerBuffer ? 'server' : 'chat');

  return (
    <section className="min-h-0 min-w-0 overflow-hidden">
      <Card className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-3 py-2">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <Badge variant={props.workspace.selectedRuntime?.connected ? 'success' : 'secondary'}>
                {props.workspace.statusLabel}
              </Badge>
            </div>
            <h2 className="truncate text-base font-semibold tracking-tight text-foreground">{props.workspace.headerTitle}</h2>
            {props.workspace.headerSubtitle ? (
              <p className="truncate text-[13px] text-muted-foreground">{props.workspace.headerSubtitle}</p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap gap-1">
            {props.workspace.mode === 'server-connected' ||
            props.workspace.mode === 'server-connecting' ||
            props.workspace.mode === 'server-offline' ? (
              <Button variant="outline" size="sm" onClick={() => selectedNetwork && props.onCloseConnection(selectedNetwork)}>
                <X />
                Close
              </Button>
            ) : null}
            {selectedChannel ? (
              <Button variant="outline" size="sm" onClick={() => props.onCloseChannel(selectedChannel.networkId, selectedChannel.name)}>
                <X />
                Close
              </Button>
            ) : null}
            {selectedBuffer?.kind === 'query' ? (
              <Button variant="outline" size="sm" onClick={() => props.onCloseBuffer(selectedBuffer)}>
                <X />
                Close
              </Button>
            ) : null}
            {selectedNetwork ? (
              props.workspace.selectedRuntime?.connected ? (
                <Button variant="ghost" size="sm" onClick={() => props.onDisconnect(selectedNetwork.id)}>
                  <PowerOff />
                  Disconnect
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => props.onReconnect(selectedNetwork)}
                  disabled={props.workspace.selectedRuntime?.connecting}
                >
                  <RefreshCcw />
                  Reconnect
                </Button>
              )
            ) : null}
          </div>
        </div>

        <div ref={props.scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-background/45 px-3 py-2">
          {props.selectedMessages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="w-full max-w-md border border-border bg-card px-4 py-5 text-center">
                <div className="mx-auto mb-3 flex size-8 items-center justify-center border border-border bg-secondary">
                  <Plug2 className="size-4 text-muted-foreground" />
                </div>
                <p className="text-[13px] leading-6 text-muted-foreground">{props.workspace.emptyBody}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-0.5 font-mono text-[12px]">
              {renderBlocks.map((block) =>
                block.kind === 'group' ? (
                  <GroupedMessageBlock
                    key={block.messages[0].id}
                    messages={block.messages}
                    mode={props.messageDisplayMode}
                    sourceLabel={getGroupSourceLabel(block.messages[0], isServerBuffer ? 'server' : 'chat')}
                    onOpenChannel={props.onOpenMentionedChannel}
                  />
                ) : isCompactMessage(block.message) ? (
                  <CompactMessageRow
                    key={block.message.id}
                    message={block.message}
                    mode={props.messageDisplayMode}
                    onOpenChannel={props.onOpenMentionedChannel}
                  />
                ) : (
                  <article key={block.message.id} className={cn('border px-2 py-1.5', messageTone(block.message))}>
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                      <span>{formatTime(block.message.ts)}</span>
                      {block.message.nick ? <span className="font-medium text-foreground">{block.message.nick}</span> : null}
                      {showKindLabel(block.message) ? <span>{block.message.kind}</span> : null}
                    </div>
                    <p
                      className={cn(
                        'whitespace-pre-wrap break-words font-sans text-[13px] leading-5 text-foreground',
                        isActionBody(block.message) && 'italic'
                      )}
                    >
                      <FormattedMessageText
                        text={block.message.body}
                        mode={props.messageDisplayMode}
                        onOpenChannel={props.onOpenMentionedChannel}
                      />
                    </p>
                  </article>
                )
              )}
            </div>
          )}
        </div>

        {props.workspace.composerMode !== 'hidden' ? (
          <footer className="shrink-0 border-t border-border bg-card px-3 py-2">
            <div className="flex gap-2">
              <Input
                value={props.draft}
                className="flex-1"
                onChange={(event) => props.onDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowUp' && !event.altKey && !event.ctrlKey && !event.metaKey) {
                    event.preventDefault();
                    props.onRecallOlderDraft();
                    return;
                  }
                  if (event.key === 'ArrowDown' && !event.altKey && !event.ctrlKey && !event.metaKey) {
                    event.preventDefault();
                    props.onRecallNewerDraft();
                    return;
                  }
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void props.onSend();
                  }
                }}
                placeholder={props.workspace.composerPlaceholder}
              />
              <Button onClick={() => void props.onSend()}>
                <SendHorizonal />
                Send
              </Button>
            </div>
          </footer>
        ) : null}
      </Card>
    </section>
  );
}

const formatTime = (value: number) =>
  new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

function GroupedMessageBlock(props: {
  messages: ChatMessage[];
  mode: MessageDisplayMode;
  sourceLabel: string;
  onOpenChannel: (channel: string) => void;
}) {
  const firstMessage = props.messages[0];
  const continuationMessages = props.messages.slice(1);

  return (
    <article className={cn('border px-2 py-1.5', messageTone(firstMessage))}>
      <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 gap-y-1">
        <div />
        <div className="min-w-0">
          <div className="mb-0.5 flex flex-wrap items-baseline gap-2">
            <span className="font-sans text-[15px] font-semibold text-foreground">{props.sourceLabel}</span>
            <span className="text-[11px] leading-5 text-muted-foreground">
              {formatTime(firstMessage.ts)}
            </span>
          </div>
          <p className="whitespace-pre-wrap break-words font-sans text-[13px] leading-5 text-foreground">
            <FormattedMessageText text={firstMessage.body} mode={props.mode} onOpenChannel={props.onOpenChannel} />
          </p>
        </div>

        {continuationMessages.map((message) => (
          <div key={message.id} className="group/line col-span-2 grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3">
            <span className="pr-1 pt-0.5 text-right text-[11px] leading-5 text-muted-foreground/85 opacity-0 transition-opacity group-hover/line:opacity-100">
              {formatTime(message.ts)}
            </span>
            <p className="whitespace-pre-wrap break-words font-sans text-[13px] leading-5 text-foreground">
              <FormattedMessageText text={message.body} mode={props.mode} onOpenChannel={props.onOpenChannel} />
            </p>
          </div>
        ))}
      </div>
    </article>
  );
}

function CompactMessageRow(props: {
  message: ChatMessage;
  mode: MessageDisplayMode;
  onOpenChannel: (channel: string) => void;
}) {
  const { message } = props;
  const actionBody = isActionBody(message);
  const showNick = message.nick && (message.kind === 'line' || showKindLabel(message));

  return (
    <article className={cn('border px-2 py-1.5', messageTone(message))}>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px] leading-5">
        <span className="shrink-0 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          {formatTime(message.ts)}
        </span>
        {showNick && !actionBody ? (
          <span className="font-semibold text-foreground">{message.nick}</span>
        ) : null}
        {showKindLabel(message) ? <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{message.kind}</span> : null}
        <span className={cn('min-w-0 break-words font-sans text-[13px] text-foreground', actionBody && 'italic')}>
          <FormattedMessageText text={message.body} mode={props.mode} onOpenChannel={props.onOpenChannel} />
        </span>
      </p>
    </article>
  );
}

function buildRenderBlocks(messages: ChatMessage[], mode: 'chat' | 'server') {
  const blocks: Array<{ kind: 'group'; messages: ChatMessage[] } | { kind: 'single'; message: ChatMessage }> = [];
  let currentGroup: ChatMessage[] = [];

  const flushGroup = () => {
    if (currentGroup.length > 0) {
      blocks.push({ kind: 'group', messages: currentGroup });
      currentGroup = [];
    }
  };

  for (const message of messages) {
    if (!canGroupMessage(message, mode)) {
      flushGroup();
      blocks.push({ kind: 'single', message });
      continue;
    }

    const previous = currentGroup.at(-1);
    if (previous && canContinueGroup(previous, message, mode)) {
      currentGroup.push(message);
      continue;
    }

    flushGroup();
    currentGroup = [message];
  }

  flushGroup();
  return blocks;
}

const canGroupMessage = (message: ChatMessage, mode: 'chat' | 'server') =>
  mode === 'server'
    ? getGroupSourceLabel(message, mode).length > 0 && !isActionBody(message)
    : message.kind === 'line' && message.nick !== null && !isActionBody(message);

const canContinueGroup = (previous: ChatMessage, next: ChatMessage, mode: 'chat' | 'server') =>
  getGroupSourceKey(previous, mode) === getGroupSourceKey(next, mode) &&
  previous.kind === next.kind &&
  previous.self === next.self;

const getGroupSourceKey = (message: ChatMessage, mode: 'chat' | 'server') =>
  `${message.kind}:${getGroupSourceLabel(message, mode)}`;

const getGroupSourceLabel = (message: ChatMessage, mode: 'chat' | 'server') => {
  if (mode === 'chat') {
    return message.nick ?? '';
  }
  if (message.nick) {
    return message.nick;
  }
  if (message.kind === 'system') {
    return 'Server';
  }
  if (message.kind === 'notice') {
    return 'Notice';
  }
  if (message.kind === 'error') {
    return 'Error';
  }
  return '';
};

const isCompactMessage = (message: ChatMessage) =>
  message.kind === 'line' || message.kind === 'join' || message.kind === 'part';

const isActionBody = (message: ChatMessage) => message.kind === 'line' && message.body.startsWith('* ');

const showKindLabel = (message: ChatMessage) => message.kind === 'notice' || message.kind === 'error';

const messageTone = (message: ChatMessage) => {
  if (message.kind === 'error') {
    return 'border-destructive/40 bg-destructive/10';
  }
  if (message.kind === 'notice') {
    return 'border-primary/30 bg-primary/8';
  }
  if (message.kind === 'join') {
    return 'border-emerald-500/30 bg-emerald-500/10';
  }
  if (message.kind === 'part') {
    return 'border-amber-400/30 bg-amber-400/10';
  }
  if (message.kind === 'system') {
    return 'border-border bg-secondary';
  }
  if (message.self) {
    return 'border-primary/35 bg-accent';
  }
  return 'border-border bg-card';
};
