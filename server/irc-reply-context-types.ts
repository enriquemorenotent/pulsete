export type ChannelReplyOperation = 'join' | 'part' | 'topic-set' | 'topic-query' | 'names';

export type PendingReplyContext =
  | { kind: 'message'; sourceTarget: string; target: string; expiresAt: number }
  | { kind: 'whois'; sourceTarget: string; nick: string; expiresAt: number }
  | { kind: 'raw-target'; sourceTarget: string; command: 'MODE'; target: string; expiresAt: number }
  | { kind: 'raw-list'; sourceTarget: string; expiresAt: number }
  | { kind: 'channel-list'; requestId: string; expiresAt: number }
  | {
      kind: 'channel';
      sourceTarget: string;
      channel: string;
      operation: ChannelReplyOperation;
      failedJoinBufferId?: string;
      requestedTopic?: string;
      expiresAt: number;
    }
  | { kind: 'nick'; sourceTarget: string; requestedNick: string; expiresAt: number }
  | { kind: 'ison'; sourceTarget: string; expiresAt: number }
  | { kind: 'friend-presence'; pollId: number; expiresAt: number };

export const replyContextTtlMs = 15_000;
