import type { IrcCaseMapping } from '../shared/irc-server-rules.js';
import { isSameIrcIdentifier } from '../shared/irc-identifiers.js';
import type { NetworkProfile } from '../shared/protocol-chat.js';
import { badRequest } from './app-error.js';

export const selfPrivateMessageTargetMessage = 'Private-message target cannot be your own nick';

export const assertNotSelfPrivateMessageTarget = (
  target: string,
  network: Pick<NetworkProfile, 'altNicks' | 'nick'>,
  currentNick?: string | null,
  mapping?: IrcCaseMapping,
) => {
  const ownNicks = [
    currentNick ?? null,
    network.nick,
    ...network.altNicks,
  ];
  if (ownNicks.some((nick) => isSameIrcIdentifier(target, nick, mapping))) {
    throw badRequest(selfPrivateMessageTargetMessage);
  }
};
