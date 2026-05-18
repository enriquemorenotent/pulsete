import { isSameIrcIdentifier } from '../shared/irc-identifiers.js';
import type { NetworkProfile } from '../shared/protocol-chat.js';
import { badRequest } from './app-error.js';

export const selfPrivateMessageTargetMessage = 'Private-message target cannot be your own nick';

export const assertNotSelfPrivateMessageTarget = (
  target: string,
  network: Pick<NetworkProfile, 'altNicks' | 'nick'>,
  currentNick?: string | null,
) => {
  const ownNicks = [
    currentNick ?? null,
    network.nick,
    ...network.altNicks,
  ];
  if (ownNicks.some((nick) => isSameIrcIdentifier(target, nick))) {
    throw badRequest(selfPrivateMessageTargetMessage);
  }
};
