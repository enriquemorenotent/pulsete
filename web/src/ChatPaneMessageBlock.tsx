import type { RefObject } from 'react';
import type { ChannelUserMode } from '../../shared/protocol.js';
import { ChatPaneCompactMessageRow } from './ChatPaneCompactMessageRow.js';
import { ChatPaneExpandedMessageRow } from './ChatPaneExpandedMessageRow.js';
import { DayDivider, UnreadDivider } from './ChatPaneTranscriptDecorations.js';
import {
	buildRenderBlocks,
	getServerMessageSourceLabel,
	isCompactMessage,
} from './chat-pane-message-utils.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import {
	resolveMessageParticipantPresentation,
	type ParticipantHighlightMode,
} from './message-participant-presentation.js';

type RenderBlock = ReturnType<typeof buildRenderBlocks>[number];

type ChatPaneMessageBlockProps = {
	block: RenderBlock;
	channelUserModesByNick: ReadonlyMap<string, ChannelUserMode>;
	firstUnreadDividerIndex: number | null;
	listKind: 'chat' | 'server';
	mode: MessageDisplayMode;
	onOpenChannel: (channel: string) => void;
	onOpenParticipantQuery?: (nick: string) => void;
	participantHighlightMode: ParticipantHighlightMode;
	unreadDividerRef: RefObject<HTMLDivElement | null>;
};

export function ChatPaneMessageBlock(props: ChatPaneMessageBlockProps) {
	if (props.block.kind === 'day-divider') {
		return <DayDivider label={props.block.label} />;
	}

	const serverSourceLabel =
		props.listKind === 'server'
			? getServerMessageSourceLabel(props.block.message)
			: null;
	const shouldUseCompactRow =
		props.listKind === 'server' || isCompactMessage(props.block.message);
	const participant = resolveMessageParticipantPresentation({
		message: props.block.message,
		listKind: props.listKind,
		rowVariant: shouldUseCompactRow ? 'compact' : 'full',
		senderLabel: serverSourceLabel,
		highlightMode: props.participantHighlightMode,
		channelUserModesByNick: props.channelUserModesByNick,
		allowParticipantQuery: !!props.onOpenParticipantQuery,
	});

	return (
		<div>
			{props.firstUnreadDividerIndex === props.block.messageIndex ? (
				<div ref={props.unreadDividerRef} data-unread-divider>
					<UnreadDivider />
				</div>
			) : null}
			{shouldUseCompactRow ? (
				<ChatPaneCompactMessageRow
					message={props.block.message}
					participant={participant}
					hideTimestamp={props.block.hideTimestamp}
					mode={props.mode}
					onOpenChannel={props.onOpenChannel}
					onOpenParticipantQuery={props.onOpenParticipantQuery}
				/>
			) : (
				<ChatPaneExpandedMessageRow
					message={props.block.message}
					mode={props.mode}
					onOpenChannel={props.onOpenChannel}
					onOpenParticipantQuery={props.onOpenParticipantQuery}
					participant={participant}
				/>
			)}
		</div>
	);
}
