import { useState } from 'react';
import { Hash, LoaderCircle, MessageSquareMore, Plus, PowerOff, RefreshCcw, X } from 'lucide-react';
import type { BufferState, FriendState, NetworkProfile, PendingChannelState } from '../../shared/protocol.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { cn } from '@/lib/utils.js';
import { AddFriendDialog } from './AddFriendDialog.js';
import { SidebarWidget } from './SidebarWidget.js';
import type { SidebarConnectionView } from './connection-sidebar-view.js';
import type { NetworkRuntimeState } from './workspace.js';

export type ConnectionSidebarProps = {
  connections: SidebarConnectionView[];
  friends: FriendState[];
  friendPresence: Record<string, boolean>;
  onAddFriend: (nick: string) => Promise<boolean>;
  onRemoveFriend: (friendId: string) => Promise<boolean>;
  onSelectFriend: (friend: FriendState) => Promise<void>;
  onSelectNetwork: (network: NetworkProfile) => void;
  onSelectBuffer: (buffer: BufferState) => void;
  onSelectPendingChannel: (networkId: string, channel: string) => void;
  onReconnectNetwork: (network: NetworkProfile) => void;
  onDisconnectNetwork: (networkId: string) => void;
  onCloseConnection: (network: NetworkProfile) => void;
  onCloseChannel: (networkId: string, channel: string) => void;
  onCloseBuffer: (buffer: BufferState) => void;
};

export function ConnectionSidebar(props: ConnectionSidebarProps) {
  const [showAddFriendDialog, setShowAddFriendDialog] = useState(false);
  const [friendDraft, setFriendDraft] = useState('');

  return (
    <aside className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden border border-border bg-card">
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-2">
            {props.connections.length === 0 ? (
              <div className="px-2 py-2 text-[13px] text-muted-foreground">
                No open connections. Use Network Manager to connect.
              </div>
            ) : null}

            {props.connections.map((connection, index) => {
              return (
                <section key={connection.network.id} className={cn(index > 0 && 'mt-2 border-t border-border/70 pt-2')}>
                  <div className={cn('flex items-stretch rounded-sm', connection.selectedServer && 'bg-accent')}>
                    <button
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left hover:bg-accent/70"
                      onClick={() => props.onSelectNetwork(connection.network)}
                    >
                      <span className={cn('size-2 shrink-0 rounded-full', dotTone(connection.runtime))} />
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-baseline gap-1.5">
                          <span className="truncate text-[13px] font-medium text-foreground">{connection.labelParts.name}</span>
                          <span className="shrink-0 font-mono text-[11px] font-normal text-muted-foreground">
                            as {connection.labelParts.nick}
                          </span>
                          {connection.labelParts.instanceIndex === null ? null : (
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              · {connection.labelParts.instanceIndex}
                            </span>
                          )}
                        </div>
                      </div>
                      {connection.serverBuffer && connection.serverBuffer.unread > 0 ? <UnreadBadge unread={connection.serverBuffer.unread} /> : null}
                    </button>
                    <button
                      className="px-2 text-muted-foreground transition-colors hover:bg-accent/70 hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                      onClick={() =>
                        connection.runtime?.phase === 'connected'
                          ? props.onDisconnectNetwork(connection.network.id)
                          : props.onReconnectNetwork(connection.network)
                      }
                      aria-label={`${connection.runtime?.phase === 'connected' ? 'Disconnect' : 'Reconnect'} ${connection.label}`}
                      disabled={connection.runtime?.phase === 'connecting'}
                    >
                      {connection.runtime?.phase === 'connected' ? <PowerOff className="size-3.5" /> : <RefreshCcw className="size-3.5" />}
                    </button>
                    <button
                      className="px-2 text-muted-foreground transition-colors hover:bg-accent/70 hover:text-accent-foreground"
                      onClick={() => props.onCloseConnection(connection.network)}
                      aria-label={`Close ${connection.label}`}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>

                  {connection.childBuffers.length > 0 || connection.pendingChannels.length > 0 ? (
                    <div className="mt-1 space-y-0.5 pl-4">
                      {connection.childBuffers.map(({ buffer, selected }) =>
                        buffer.kind === 'channel' ? (
                          <SidebarChannelRow
                            key={buffer.id}
                            buffer={buffer}
                            dimmed={connection.childBuffersDimmed}
                            selected={selected}
                            onSelect={() => props.onSelectBuffer(buffer)}
                            onClose={() => props.onCloseChannel(connection.network.id, buffer.target)}
                          />
                        ) : (
                          <SidebarQueryRow
                            key={buffer.id}
                            buffer={buffer}
                            dimmed={connection.childBuffersDimmed}
                            selected={selected}
                            onSelect={() => props.onSelectBuffer(buffer)}
                            onClose={() => props.onCloseBuffer(buffer)}
                          />
                        )
                      )}
                      {connection.pendingChannels.map(({ pendingChannel, selected }) => (
                        <SidebarPendingChannelRow
                          key={`${pendingChannel.networkId}:${pendingChannel.channel}`}
                          pendingChannel={pendingChannel}
                          selected={selected}
                          onSelect={() => props.onSelectPendingChannel(pendingChannel.networkId, pendingChannel.channel)}
                        />
                      ))}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </ScrollArea>
      </section>
      <SidebarWidget
        title="Friends"
        className="shrink-0"
        actions={
          <button
            type="button"
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Add friend"
            onClick={() => setShowAddFriendDialog(true)}
          >
            <Plus className="size-4" />
          </button>
        }
      >
        {props.friends.length === 0 ? (
          <div className="px-3 py-2 text-[13px] text-muted-foreground">
            No friends saved yet.
          </div>
        ) : (
          <ScrollArea className="max-h-48">
            <div className="space-y-0.5 px-2 pb-2">
              {props.friends.map((friend) => (
                <div key={friend.id} className="flex items-stretch rounded-sm">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[13px] text-foreground hover:bg-accent"
                    onClick={() => void props.onSelectFriend(friend)}
                    aria-label={`Open ${friend.nick} (${props.friendPresence[friend.id] ? 'online' : 'offline'})`}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        props.friendPresence[friend.id] ? 'bg-emerald-400' : 'bg-zinc-500/70'
                      )}
                    />
                    <span className="truncate">{friend.nick}</span>
                  </button>
                  <button
                    type="button"
                    className="px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    aria-label={`Remove ${friend.nick}`}
                    onClick={() => void props.onRemoveFriend(friend.id)}
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </SidebarWidget>
      <AddFriendDialog
        open={showAddFriendDialog}
        draft={friendDraft}
        onDraftChange={setFriendDraft}
        onOpenChange={(open) => {
          setShowAddFriendDialog(open);
          if (!open) {
            setFriendDraft('');
          }
        }}
        onSubmit={async () => {
          const saved = await props.onAddFriend(friendDraft);
          if (saved) {
            setFriendDraft('');
            setShowAddFriendDialog(false);
          }
        }}
      />
    </aside>
  );
}

function SidebarChannelRow(props: {
  buffer: BufferState;
  dimmed: boolean;
  selected: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <div className={cn('flex items-stretch rounded-sm', props.selected && 'bg-accent')}>
      <button
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left hover:bg-accent/70',
          props.dimmed && 'opacity-70'
        )}
        onClick={props.onSelect}
        aria-label={`Open ${props.buffer.target}`}
      >
        <Hash className="size-3 shrink-0 text-muted-foreground" />
        <span className={cn('truncate text-[13px] text-foreground', props.dimmed && 'text-muted-foreground')}>
          {props.buffer.target}
        </span>
        {props.buffer.unread > 0 ? <UnreadBadge unread={props.buffer.unread} /> : null}
      </button>
      <button
        className="px-2 text-muted-foreground transition-colors hover:bg-accent/70 hover:text-accent-foreground"
        onClick={props.onClose}
        aria-label={`Close ${props.buffer.target}`}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function SidebarQueryRow(props: {
  buffer: BufferState;
  dimmed: boolean;
  selected: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <div className={cn('flex items-stretch rounded-sm', props.selected && 'bg-accent')}>
      <button
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left hover:bg-accent/70',
          props.dimmed && 'opacity-70'
        )}
        onClick={props.onSelect}
        aria-label={`Open ${props.buffer.target}`}
      >
        <MessageSquareMore className="size-3 shrink-0 text-muted-foreground" />
        <span className={cn('truncate text-[13px] text-foreground', props.dimmed && 'text-muted-foreground')}>
          {props.buffer.target}
        </span>
        {props.buffer.unread > 0 ? <UnreadBadge unread={props.buffer.unread} /> : null}
      </button>
      <button
        className="px-2 text-muted-foreground transition-colors hover:bg-accent/70 hover:text-accent-foreground"
        onClick={props.onClose}
        aria-label={`Close ${props.buffer.target}`}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function SidebarPendingChannelRow(props: {
  pendingChannel: PendingChannelState;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div className={cn('flex items-stretch rounded-sm', props.selected && 'bg-accent')}>
      <button
        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left hover:bg-accent/70"
        onClick={props.onSelect}
        aria-label={`Open pending ${props.pendingChannel.channel}`}
      >
        <Hash className="size-3 shrink-0 text-muted-foreground" />
        <span className="truncate text-[13px] text-foreground">{props.pendingChannel.channel}</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          <LoaderCircle className="size-3 animate-spin" />
          joining
        </span>
      </button>
    </div>
  );
}

function UnreadBadge(props: { unread: number }) {
  return (
    <span className="ml-auto rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] tracking-normal text-muted-foreground">
      {props.unread}
    </span>
  );
}

const dotTone = (runtime: NetworkRuntimeState | null) => {
  if (runtime?.phase === 'connected') {
    return 'bg-emerald-400';
  }
  if (runtime?.phase === 'connecting') {
    return 'bg-amber-300';
  }
  return 'bg-zinc-500';
};
