import type { ChannelUserMode } from '../../shared/protocol-chat.js';
import type { NetworkUserIdentity } from '../../shared/user-identity.js';
import { Button } from '@/components/ui/button.js';
import { DayDivider, TranscriptEmptyState } from './ChatPaneTranscriptDecorations.js';
import type { ChatTranscriptModel } from './transcript/model.js';
import { ChatTranscriptRow } from './ChatTranscriptRow.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import type { ParticipantHighlightMode } from './message-participant-presentation.js';

type ChatTranscriptStaticProps = {
  channelUserModesByNick: ReadonlyMap<string, ChannelUserMode>;
  emptyBody: string;
  expandedMutedGroupKeys: ReadonlySet<string>;
  nickEmojiByNetworkNick: ReadonlyMap<string, string>;
  listKind: 'chat' | 'server';
  loadingOlderHistory?: boolean;
  mode: MessageDisplayMode;
  model: ChatTranscriptModel;
  onOpenChannel: (channel: string) => void;
  onOpenParticipantQuery?: (nick: string, identity?: NetworkUserIdentity | null) => void;
  onLoadOlderHistory?: () => Promise<number>;
  onToggleMutedGroup: (key: string) => void;
  participantHighlightMode: ParticipantHighlightMode;
};

export function ChatTranscriptStatic(props: ChatTranscriptStaticProps) {
  const showLoadOlder = !!props.onLoadOlderHistory;

  if (props.model.flatRows.length === 0) {
    return (
      <div className="h-full overflow-y-auto px-4 py-4 pt-0">
        <TranscriptEmptyState body={props.emptyBody} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-4 pt-0">
      {showLoadOlder ? (
        <div className="mb-2 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            disabled={props.loadingOlderHistory}
            onClick={() => void props.onLoadOlderHistory?.()}
          >
            {props.loadingOlderHistory ? 'Loading older...' : 'Load older'}
          </Button>
        </div>
      ) : null}
      <div className="space-y-1.5 font-mono text-[12px]">
        {props.model.groups.map((group) => (
          <div key={group.key}>
            <DayDivider label={group.label} />
            {group.rows.map((row) => (
              <ChatTranscriptRow
                key={row.key}
                row={row}
                channelUserModesByNick={props.channelUserModesByNick}
                expandedMutedGroupKeys={props.expandedMutedGroupKeys}
                nickEmojiByNetworkNick={props.nickEmojiByNetworkNick}
                listKind={props.listKind}
                mode={props.mode}
                onOpenChannel={props.onOpenChannel}
                onOpenParticipantQuery={props.onOpenParticipantQuery}
                onToggleMutedGroup={props.onToggleMutedGroup}
                participantHighlightMode={props.participantHighlightMode}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
