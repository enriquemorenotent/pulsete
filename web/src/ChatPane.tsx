import type { RefObject } from 'react';
import type { BufferState, ChatMessage, FriendState, NetworkProfile } from '../../shared/protocol.js';
import { Card } from '@/components/ui/card.js';
import type { ChannelListState } from './app-types.js';
import { ChannelListDialog } from './ChannelListDialog.js';
import { ChatPaneComposer } from './ChatPaneComposer.js';
import { ChatPaneHeader } from './ChatPaneHeader.js';
import { ChatPaneMessageList } from './ChatPaneMessageList.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import type { WorkspaceView } from './workspace.js';

export type ChatPaneProps = {
  workspace: WorkspaceView;
  friends: FriendState[];
  selectedMessages: ChatMessage[];
  draft: string;
  messageDisplayMode: MessageDisplayMode;
  scrollRef: RefObject<HTMLDivElement | null>;
  onDraftChange: (value: string) => void;
  onRecallOlderDraft: () => void;
  onRecallNewerDraft: () => void;
  onSend: () => Promise<void>;
  onAddFriend: (nick: string) => Promise<boolean>;
  onRemoveFriend: (friendId: string) => Promise<boolean>;
  onCloseChannel: (networkId: string, channel: string) => void;
  onCloseBuffer: (buffer: BufferState) => void;
  channelList: ChannelListState;
  channelListNetwork: NetworkProfile | null;
  onCloseChannelList: () => void;
  onJoinChannelFromList: (channel: string) => Promise<void>;
  onOpenMentionedChannel: (channel: string) => void;
  onOpenChannelList: () => void;
};

export function ChatPane(props: ChatPaneProps) {
  const isServerBuffer =
    props.workspace.mode === 'server-connected' ||
    props.workspace.mode === 'server-connecting' ||
    props.workspace.mode === 'server-offline';

  return (
    <section className="h-full min-h-0 min-w-0 overflow-hidden">
      <Card className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden">
        <ChatPaneHeader
          workspace={props.workspace}
          friends={props.friends}
          onAddFriend={props.onAddFriend}
          onRemoveFriend={props.onRemoveFriend}
          onCloseChannel={props.onCloseChannel}
          onCloseBuffer={props.onCloseBuffer}
          onOpenChannelList={props.onOpenChannelList}
        />
        <ChatPaneMessageList
          messages={props.selectedMessages}
          scrollRef={props.scrollRef}
          emptyBody={props.workspace.emptyBody}
          mode={props.messageDisplayMode}
          listKind={isServerBuffer ? 'server' : 'chat'}
          onOpenChannel={props.onOpenMentionedChannel}
        />
        {props.workspace.composerMode !== 'hidden' ? (
          <ChatPaneComposer
            draft={props.draft}
            placeholder={props.workspace.composerPlaceholder}
            onDraftChange={props.onDraftChange}
            onRecallOlderDraft={props.onRecallOlderDraft}
            onRecallNewerDraft={props.onRecallNewerDraft}
            onSend={props.onSend}
          />
        ) : null}
      </Card>
      <ChannelListDialog
        network={props.channelListNetwork}
        state={props.channelList}
        onClose={props.onCloseChannelList}
        onJoin={props.onJoinChannelFromList}
      />
    </section>
  );
}
