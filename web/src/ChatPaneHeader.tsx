import type { ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import type { BufferState, FriendState } from '../../shared/protocol.js';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';
import { FriendToggleButton } from './FriendToggleButton.js';
import { findFriendByNick } from './friend-utils.js';
import type { WorkspaceView } from './workspace.js';

type ChatPaneHeaderProps = {
  workspace: WorkspaceView;
  friends: FriendState[];
  onAddFriend: (nick: string) => Promise<boolean>;
  onRemoveFriend: (friendId: string) => Promise<boolean>;
  showChannelAutoJoin: boolean;
  channelAutoJoinActive: boolean;
  onToggleChannelAutoJoin: () => Promise<boolean>;
  canClearHistory?: boolean;
  onClearHistory?: () => Promise<boolean>;
  canDownloadHistory?: boolean;
  onDownloadHistory?: () => Promise<boolean>;
  canImportHistory?: boolean;
  onOpenHistoryImport?: () => void;
  onOpenSelfNickAliases?: () => void;
  onCloseChannel: (networkId: string, channel: string) => void;
  onCloseBuffer: (buffer: BufferState) => void;
  onOpenChannelList: () => void;
};

export function ChatPaneHeader(props: ChatPaneHeaderProps) {
  const { selectedBuffer, selectedChannel } = props.workspace;
  const selectedFriend =
    selectedBuffer?.kind === 'query' ? findFriendByNick(props.friends, selectedBuffer.target) : null;
  const autoJoinLabel = props.channelAutoJoinActive ? 'Autojoin On' : 'Autojoin Off';
  const isServerBuffer =
    props.workspace.mode === 'server-connected' ||
    props.workspace.mode === 'server-connecting' ||
    props.workspace.mode === 'server-offline';
  if (props.workspace.mode === 'server-connected') {
    return (
      <PaneHeader
        title={props.workspace.selectedNetwork?.name ?? 'Server'}
        subtitle={props.workspace.headerSubtitle}
        actions={<Button variant="outline" size="sm" onClick={props.onOpenChannelList}>List Channels</Button>}
      />
    );
  }
  if (isServerBuffer) {
    return null;
  }
  return (
    <PaneHeader
      title={props.workspace.headerTitle}
      subtitle={props.workspace.headerSubtitle}
      actions={
        <>
          {props.showChannelAutoJoin ? (
            <Button
              variant={props.channelAutoJoinActive ? 'secondary' : 'outline'}
              size="sm"
              aria-pressed={props.channelAutoJoinActive}
              aria-label={autoJoinLabel}
              title={autoJoinLabel}
              onClick={() => void props.onToggleChannelAutoJoin()}
            >
              {props.channelAutoJoinActive ? <Check /> : null}
              {autoJoinLabel}
            </Button>
          ) : null}
          {selectedBuffer?.kind === 'query' ? (
            <FriendToggleButton
              active={Boolean(selectedFriend)}
              onClick={() =>
                void (selectedFriend
                  ? props.onRemoveFriend(selectedFriend.id)
                  : props.onAddFriend(selectedBuffer.target))
              }
            />
          ) : null}
          {props.canClearHistory && props.onClearHistory ? (
            <Button variant="outline" size="sm" onClick={() => void props.onClearHistory?.()}>
              Clear history
            </Button>
          ) : null}
          {props.canDownloadHistory && props.onDownloadHistory ? (
            <Button variant="outline" size="sm" onClick={() => void props.onDownloadHistory?.()}>
              Download history
            </Button>
          ) : null}
          {props.canImportHistory && props.onOpenHistoryImport ? (
            <Button variant="outline" size="sm" onClick={props.onOpenHistoryImport}>
              Import logs
            </Button>
          ) : null}
          {(selectedBuffer?.kind === 'channel' || selectedBuffer?.kind === 'query') && props.onOpenSelfNickAliases ? (
            <Button variant="outline" size="sm" onClick={props.onOpenSelfNickAliases}>
              Self aliases
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
        </>
      }
    />
  );
}

function PaneHeader(props: { title: string; subtitle: string; actions: ReactNode }) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-3 py-2">
      <div className="min-w-0">
        {props.title ? (
          <h2 className={cn('truncate text-base font-semibold tracking-tight text-foreground', props.subtitle && 'mb-1')}>
            {props.title}
          </h2>
        ) : null}
        {props.subtitle ? (
          <p className="truncate text-[13px] text-muted-foreground">{props.subtitle}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap gap-1">{props.actions}</div>
    </div>
  );
}
