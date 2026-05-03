import { emitStatus } from './irc-emit.js';
import { isSameIrcIdentifier } from './irc-parser.js';
import { matchesServiceTargetNick } from './irc-services.js';
import {
  resolveNetworkAuthAccount,
  resolveNetworkAuthMethod,
  resolveNetworkAuthTarget,
} from '../shared/network-model.js';
import type { IrcRegistrationContext } from './irc-contexts.js';
import type { IrcSaslState } from './irc-state-types.js';
import type { IrcConnectionData, IrcConnectionMethods } from './irc-types.js';
import type { RuntimeNetworkProfile } from './storage-types.js';
import {
  buildCapabilityNegotiationLines,
  buildServerPassLines,
  createIdleSaslState,
  finishSaslNegotiation,
  getWelcomeSaslFallbackMessage,
} from './irc-sasl.js';

export { createIdleSaslState, handleRegistrationAuthLine } from './irc-sasl.js';

const nickservIdentifySuccessPatterns = [
  /\bpassword accepted\b/i,
  /\byou are (?:already |now )?identified\b/i,
  /\byou are successfully identified\b/i,
  /\byou are now recogni[sz]ed\b/i,
  /\byou are now logged in\b/i,
];

type IrcDeferredAutoJoinContext =
  Pick<IrcConnectionData, 'lifecycle' | 'profile'>
  & Pick<IrcConnectionMethods, 'join' | 'listReconnectChannels'>;

export const buildRegistrationLines = (profile: RuntimeNetworkProfile) => [
  ...buildServerPassLines(profile),
  ...buildCapabilityNegotiationLines(profile),
  `NICK ${profile.nick}`,
  `USER ${toRegistrationIdent(profile.nick)} 0 * :${profile.realName || profile.name}`,
];

export const toRegistrationIdent = (nick: string) => {
  const ident = nick.trim().replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 32);
  if (!ident) {
    return 'pulsete';
  }
  return /^[A-Za-z0-9]/.test(ident) ? ident : `u${ident}`.slice(0, 32);
};

export const buildPostRegistrationAuthLines = (profile: RuntimeNetworkProfile) => {
  const authMethod = resolveNetworkAuthMethod(profile);
  if (authMethod !== 'nickserv' || !profile.password) {
    return [];
  }
  return [`PRIVMSG ${resolveNetworkAuthTarget(profile.authTarget)} :IDENTIFY ${resolveNetworkAuthAccount(profile)} ${profile.password}`];
};

export const createLoginSaslState = (profile: RuntimeNetworkProfile): IrcSaslState =>
  buildCapabilityNegotiationLines(profile).length > 0
    ? {
        phase: 'awaiting-cap-list',
        capabilityAdvertised: false,
        capEndSent: false,
        offeredCapabilities: new Set<string>(),
        pendingCapabilities: new Set<string>(),
      }
    : createIdleSaslState();

export const resolveDeferredNickservAutoJoinTarget = (profile: RuntimeNetworkProfile) =>
  usesNickServ(profile) && profile.autoJoin.length > 0
    ? resolveNetworkAuthTarget(profile.authTarget)
    : null;

export const handlePostRegistrationAutoJoin = (connection: IrcDeferredAutoJoinContext) => {
  if (connection.lifecycle.pendingNickservAutoJoinTarget) {
    return false;
  }
  return joinConfiguredChannels(connection);
};

export const handleWelcomeAuthFallback = (connection: IrcRegistrationContext) => {
  const message = getWelcomeSaslFallbackMessage(connection.lifecycle.sasl.phase);
  if (!message) {
    return false;
  }
  emitStatus(connection, message, 'error');
  finishSaslNegotiation(connection, { sendCapEnd: false });
  return true;
};

export const handleNickservAutoJoinMessage = (
  connection: IrcDeferredAutoJoinContext,
  rawTarget: string,
  nick: string | null,
  payload: string
) => {
  const pendingTarget = connection.lifecycle.pendingNickservAutoJoinTarget;
  if (
    !pendingTarget
    || !isNickservReplyTarget(rawTarget, pendingTarget, connection.lifecycle.currentNick)
    || !matchesServiceTargetNick(nick, pendingTarget)
  ) {
    return false;
  }
  if (!nickservIdentifySuccessPatterns.some((pattern) => pattern.test(payload))) {
    return false;
  }
  return completeDeferredNickservAutoJoin(connection);
};

export const handleAccountLoginState = (
  connection: IrcDeferredAutoJoinContext,
  accountName: string | null,
) => {
  connection.lifecycle.accountName = accountName;
  if (!accountName) {
    return false;
  }
  return completeDeferredNickservAutoJoin(connection);
};
const usesNickServ = (profile: RuntimeNetworkProfile) =>
  resolveNetworkAuthMethod(profile) === 'nickserv' && Boolean(profile.password);

const completeDeferredNickservAutoJoin = (connection: IrcDeferredAutoJoinContext) => {
  if (!connection.lifecycle.pendingNickservAutoJoinTarget) {
    return false;
  }
  connection.lifecycle.pendingNickservAutoJoinTarget = null;
  return joinConfiguredChannels(connection);
};

const isNickservReplyTarget = (rawTarget: string, pendingTarget: string, currentNick: string) =>
  rawTarget === '*'
  || isSameIrcIdentifier(rawTarget, currentNick)
  || isSameIrcIdentifier(rawTarget, pendingTarget);

const joinConfiguredChannels = (connection: IrcDeferredAutoJoinContext) => {
  let joinedAny = false;
  const configuredChannels = [...connection.profile.autoJoin, ...connection.listReconnectChannels()]
    .filter((channel, index, channels) =>
      channels.findIndex((candidate) => isSameIrcIdentifier(candidate, channel)) === index
    );
  for (const channel of configuredChannels) {
    connection.join(channel);
    joinedAny = true;
  }
  return joinedAny;
};
