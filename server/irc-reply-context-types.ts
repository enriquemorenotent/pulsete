export type ChannelReplyOperation = 'join' | 'part' | 'topic-set' | 'topic-query' | 'names';

type PendingReplyBase = {
  expiresAt: number;
  label?: string;
};

export type PendingReplyContext =
  | (PendingReplyBase & { kind: 'message'; sourceTarget: string; target: string; optimisticMessageId?: string })
  | (PendingReplyBase & { kind: 'whois'; sourceTarget: string; nick: string })
  | (PendingReplyBase & { kind: 'raw-target'; sourceTarget: string; command: 'MODE'; target: string })
  | (PendingReplyBase & { kind: 'raw-list'; sourceTarget: string })
  | (PendingReplyBase & { kind: 'channel-list'; requestId: string })
  | {
      label?: string;
      kind: 'channel';
      sourceTarget: string;
      channel: string;
      operation: ChannelReplyOperation;
      failedJoinBufferId?: string;
      requestedTopic?: string;
      expiresAt: number;
    }
  | (PendingReplyBase & { kind: 'nick'; sourceTarget: string; requestedNick: string })
  | (PendingReplyBase & { kind: 'ison'; sourceTarget: string })
  | (PendingReplyBase & { kind: 'friend-presence-ison'; snapshotId: number });

export const replyContextTtlMs = 15_000;
