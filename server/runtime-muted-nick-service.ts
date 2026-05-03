import type { MutedNickState } from '../shared/protocol-chat.js';
import type { ServerMessage } from '../shared/protocol-messages.js';
import { notFound } from './app-error.js';
import { normalizeMutedNick } from './irc-validate.js';
import { recomputeMutedNickUnread } from './runtime-muted-nick-unread.js';
import type {
  RuntimeConversationStore,
  RuntimeMutedNickStore,
  RuntimeNetworkStore,
} from './runtime-store-ports.js';

type RuntimeMutedNickServiceOptions = {
  conversations: Pick<RuntimeConversationStore, 'listBuffers' | 'listAllMessages' | 'setBufferUnread'>;
  mutedNicks: RuntimeMutedNickStore;
  networks: Pick<RuntimeNetworkStore, 'get'>;
};

export class RuntimeMutedNickService {
  constructor(private readonly options: RuntimeMutedNickServiceOptions) {}

  upsertMutedNick(
    networkId: string,
    nick: string,
  ): { mutedNick: MutedNickState; messages: readonly ServerMessage[] } {
    if (!this.options.networks.get(networkId)) {
      throw notFound('Network not found');
    }
    const mutedNick = this.options.mutedNicks.upsert({
      networkId,
      nick: normalizeMutedNick(nick),
    });
    const changedBuffers = recomputeMutedNickUnread(
      this.options.conversations,
      this.options.networks,
      this.options.mutedNicks.list(networkId),
      networkId,
    );
    const messages: ServerMessage[] = [
      { type: 'muted-nick.upsert', mutedNick },
      ...changedBuffers.map((buffer) => ({ type: 'buffer.upsert', buffer } satisfies ServerMessage)),
    ];
    return {
      mutedNick,
      messages,
    };
  }

  removeMutedNick(mutedNickId: string): { mutedNickId: string; messages: readonly ServerMessage[] } {
    const mutedNick = this.options.mutedNicks.remove(mutedNickId);
    if (!mutedNick) {
      throw notFound('Muted nick not found');
    }
    const changedBuffers = recomputeMutedNickUnread(
      this.options.conversations,
      this.options.networks,
      this.options.mutedNicks.list(mutedNick.networkId),
      mutedNick.networkId,
    );
    const messages: ServerMessage[] = [
      { type: 'muted-nick.remove', mutedNickId: mutedNick.id },
      ...changedBuffers.map((buffer) => ({ type: 'buffer.upsert', buffer } satisfies ServerMessage)),
    ];
    return {
      mutedNickId: mutedNick.id,
      messages,
    };
  }
}
