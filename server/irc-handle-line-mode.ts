import { emitChannel } from './irc-emit.js';
import { updateChannelUserMode } from '../shared/channel-users.js';
import type { ChannelUserPrivilegeMode } from '../shared/protocol-chat.js';
import type { IrcConnectionState } from './irc-types.js';

const channelModeArgumentTokens = new Set(['b', 'e', 'I', 'k']);
const channelModeSetOnlyArgumentTokens = new Set(['L', 'f', 'j', 'l']);

export const handleMode = (connection: IrcConnectionState, params: string[]) => {
  const channel = connection.resolveTrackedChannel(params[0] ?? '');
  const modeSequence = params[1] ?? '';
  if (!channel || !modeSequence) {
    return;
  }
  let users = connection.getTrackedChannelUsers(channel);
  let sign: '+' | '-' = '+';
  let parameterIndex = 2;
  let changed = false;
  for (const [index, token] of Array.from(modeSequence).entries()) {
    if (token === '+' || token === '-') {
      sign = token;
      continue;
    }
    const mode = modeFromToken(token);
    if (mode) {
      const nick = params[parameterIndex++];
      if (!nick) {
        continue;
      }
      const nextUsers = updateChannelUserMode(users, nick, mode, sign === '+');
      if (nextUsers.some((user, offset) => user !== users[offset]) || nextUsers.length !== users.length) {
        users = nextUsers;
        changed = true;
      }
      continue;
    }
    if (modeTokenConsumesParameter(token, sign) || shouldConsumeUnknownModeParameter(modeSequence, index, sign, params, parameterIndex)) {
      parameterIndex += 1;
    }
  }
  if (changed) {
    connection.setTrackedChannelUsers(channel, users);
    emitChannel(connection, channel, { users });
  }
};

const modeFromToken = (token: string): ChannelUserPrivilegeMode | null =>
  token === 'q' ? 'owner'
    : token === 'a' ? 'admin'
    : token === 'o' ? 'op'
    : token === 'h' ? 'halfop'
    : token === 'v' ? 'voice'
    : null;

const modeTokenConsumesParameter = (token: string, sign: '+' | '-') =>
  ['q', 'a', 'o', 'h', 'v'].includes(token)
  || channelModeArgumentTokens.has(token)
  || (sign === '+' && channelModeSetOnlyArgumentTokens.has(token));

const shouldConsumeUnknownModeParameter = (
  modeSequence: string,
  index: number,
  sign: '+' | '-',
  params: string[],
  parameterIndex: number
) => countKnownModeParameters(modeSequence, index + 1, sign) < params.length - parameterIndex;

const countKnownModeParameters = (modeSequence: string, startIndex: number, initialSign: '+' | '-') => {
  let sign = initialSign;
  let count = 0;
  for (let index = startIndex; index < modeSequence.length; index += 1) {
    const token = modeSequence[index];
    if (token === '+' || token === '-') {
      sign = token;
      continue;
    }
    if (token && modeTokenConsumesParameter(token, sign)) {
      count += 1;
    }
  }
  return count;
};
