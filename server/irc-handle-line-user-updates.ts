import {
  updateChannelUserAway,
  updateChannelUserDetails,
} from '../shared/channel-users.js';
import { emitChannel } from './irc-emit.js';
import { handleAccountLoginState } from './irc-auth.js';
import { isSelfNick } from './irc-handle-line-helpers.js';
import type { IrcChannelEventContext } from './irc-contexts.js';

export const handleAccount = (
  connection: IrcChannelEventContext,
  params: string[],
  nick: string | null,
) => {
  if (!nick) {
    return;
  }
  const account = normalizeAccountName(params[0] ?? null);
  if (isSelfNick(connection, nick)) {
    handleAccountLoginState(connection, account);
  }
  updateUsersAcrossTrackedChannels(connection, (users) =>
    updateChannelUserDetails(users, nick, { account }),
  );
};

export const handleAway = (
  connection: IrcChannelEventContext,
  params: string[],
  nick: string | null,
) => {
  if (!nick) {
    return;
  }
  updateUsersAcrossTrackedChannels(connection, (users) =>
    updateChannelUserAway(users, nick, params.length > 0),
  );
};

export const handleChghost = (
  connection: IrcChannelEventContext,
  params: string[],
  nick: string | null,
) => {
  if (!nick) {
    return;
  }
  const username = params[0]?.trim() || null;
  const host = params[1]?.trim() || null;
  updateUsersAcrossTrackedChannels(connection, (users) =>
    updateChannelUserDetails(users, nick, { username, host }),
  );
};

export const handleSetname = (
  connection: IrcChannelEventContext,
  params: string[],
  nick: string | null,
) => {
  if (!nick) {
    return;
  }
  const realname = params[0]?.trim() || null;
  updateUsersAcrossTrackedChannels(connection, (users) =>
    updateChannelUserDetails(users, nick, { realname }),
  );
};

const updateUsersAcrossTrackedChannels = (
  connection: IrcChannelEventContext,
  updater: (
    users: ReturnType<IrcChannelEventContext['getTrackedChannelUsers']>,
  ) => ReturnType<IrcChannelEventContext['getTrackedChannelUsers']>,
) => {
  for (const [channel, users] of connection.getTrackedChannelUserEntries()) {
    const nextUsers = updater(users);
    if (nextUsers === users) {
      continue;
    }
    connection.setTrackedChannelUsers(channel, nextUsers);
    emitChannel(connection, channel, { users: nextUsers });
  }
};

const normalizeAccountName = (value: string | null) => {
  const account = value?.trim();
  return account && account !== '*' ? account : null;
};
