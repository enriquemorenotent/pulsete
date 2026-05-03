import type { ServerMessage } from '../shared/protocol-messages.js';
import type { NetworkUserIdentity } from '../shared/user-identity.js';
import { notFound } from './app-error.js';
import { normalizeNickEmoji, normalizeNickEmojiNick } from './irc-validate.js';
import type { RuntimeNetworkStore, RuntimeNickEmojiStore } from './runtime-store-ports.js';

type RuntimeNickEmojiServiceOptions = {
  networks: RuntimeNetworkStore;
  nickEmojis: RuntimeNickEmojiStore;
};

export class RuntimeNickEmojiService {
  constructor(private readonly options: RuntimeNickEmojiServiceOptions) {}

  saveNickEmoji(
    networkId: string,
    nick: string,
    emoji: string | null,
    identity?: NetworkUserIdentity | null,
  ) {
    const network = this.options.networks.get(networkId);
    if (!network) {
      throw notFound('Network not found');
    }
    const normalizedNick = normalizeNickEmojiNick(nick);
    const normalizedEmoji = normalizeNickEmoji(emoji);
    if (!normalizedEmoji) {
      const removed = this.options.nickEmojis.removeByIdentity(network.id, normalizedNick, identity);
      const messages = removed
        ? [{ type: 'nick-emoji.remove', nickEmojiId: removed.id }] satisfies ServerMessage[]
        : [];
      return { nickEmoji: null, messages };
    }
    const nickEmoji = this.options.nickEmojis.upsert({
      networkId: network.id,
      nick: normalizedNick,
      identity: identity ?? undefined,
      emoji: normalizedEmoji,
    });
    const messages = [{ type: 'nick-emoji.upsert', nickEmoji }] satisfies ServerMessage[];
    return { nickEmoji, messages };
  }
}
