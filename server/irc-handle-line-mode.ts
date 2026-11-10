import { modeArgument } from '../shared/irc-server-rules.js';
import { emitChannel } from './irc-emit.js';
import { updateChannelUserMode } from '../shared/channel-users.js';
import type { ChannelUserPrivilegeMode } from '../shared/protocol-chat.js';
import type { IrcConnectionState } from './irc-types.js';

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
  for (const token of modeSequence) {
    if (token === '+' || token === '-') {
      sign = token;
      continue;
    }
    const rules = connection.lifecycle.serverSupport.rules;
    const consumes = modeArgument(token, sign === '+', rules);
    if (consumes === null || (consumes && !params[parameterIndex])) {
      // Without the mode's argument rule, later nicknames cannot be assigned safely.
      connection.sendRaw(`NAMES ${channel}`, channel);
      return;
    }
    const argument = consumes ? params[parameterIndex++] : undefined;
    const mode = rules.prefixModes.includes(token) ? modeFromToken(token) : null;
    if (mode) {
      const nick = argument;
      if (!nick) {
        continue;
      }
      const nextUsers = updateChannelUserMode(users, nick, mode, sign === '+', connection.lifecycle.serverSupport.rules);
      if (nextUsers.some((user, offset) => user !== users[offset]) || nextUsers.length !== users.length) {
        users = nextUsers;
        changed = true;
      }
      continue;
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
