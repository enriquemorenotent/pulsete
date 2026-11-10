import type { MutedNickState } from '../shared/protocol-chat.js';
import type { ServerMessage } from '../shared/protocol-messages.js';
import type { NetworkUserIdentity } from '../shared/user-identity.js';
import { notFound } from './app-error.js';
import { normalizeMutedNick } from './irc-validate.js';
import { collectChangedUnreadBuffers } from './runtime-muted-nick-unread.js';
import type {
  RuntimeConversationStore,
  RuntimeMutedNickStore,
  RuntimeNetworkStore,
} from './runtime-store.js';

type RuntimeMutedNickServiceOptions = {
  conversations: Pick<RuntimeConversationStore, 'listBuffers'>;
  mutedNicks: RuntimeMutedNickStore;
  networks: Pick<RuntimeNetworkStore, 'get'>;
};

export class RuntimeMutedNickService {
  constructor(private readonly options: RuntimeMutedNickServiceOptions) {}

  upsertMutedNick(
    networkId: string,
    nick: string,
    identity?: NetworkUserIdentity | null,
  ): { mutedNick: MutedNickState; messages: readonly ServerMessage[] } {
    if (!this.options.networks.get(networkId)) {
      throw notFound('Network not found');
    }
    const before = this.options.conversations.listBuffers(networkId);
    const mutedNick = this.options.mutedNicks.upsert({
      networkId,
      nick: normalizeMutedNick(nick),
      identity: identity ?? undefined,
    });
    const changedBuffers = collectChangedUnreadBuffers(
      this.options.conversations,
      before,
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
    const before = this.options.conversations.listBuffers();
    const mutedNick = this.options.mutedNicks.remove(mutedNickId);
    if (!mutedNick) {
      throw notFound('Muted nick not found');
    }
    const changedBuffers = collectChangedUnreadBuffers(
      this.options.conversations,
      before,
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
