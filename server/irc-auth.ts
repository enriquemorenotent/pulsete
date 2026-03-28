import { emitStatus } from './irc-emit.js';
import { isSameIrcIdentifier } from './irc-parser.js';
import { matchesServiceTargetNick } from './irc-services.js';
import {
  applyAcknowledgedCapabilities,
  normalizeCapabilityName,
  parseCapabilityTokens,
  recordAdvertisedCapabilities,
  resolveRequestedCapabilities,
  usesSaslPlain,
} from './irc-capabilities.js';
import {
  resolveNetworkAuthAccount,
  resolveNetworkAuthMethod,
  resolveNetworkAuthTarget,
} from '../shared/network-model.js';
import type { IrcRegistrationContext } from './irc-contexts.js';
import type { IrcSaslPhase, IrcSaslState } from './irc-state-types.js';
import type { IrcConnectionData, IrcConnectionMethods } from './irc-types.js';
import type { RuntimeNetworkProfile } from './storage-types.js';

const saslChunkSize = 400;
const saslSuccessCommands = new Set(['903', '907']);
const saslFailureCommands = new Set(['904', '905', '906', '908']);
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
  `USER ${profile.username} 0 * :${profile.realName || profile.name}`,
];

export const buildPostRegistrationAuthLines = (profile: RuntimeNetworkProfile) => {
  const authMethod = resolveNetworkAuthMethod(profile);
  if (authMethod !== 'nickserv' || !profile.password) {
    return [];
  }
  return [`PRIVMSG ${resolveNetworkAuthTarget(profile.authTarget)} :IDENTIFY ${resolveNetworkAuthAccount(profile)} ${profile.password}`];
};

export const createIdleSaslState = (): IrcSaslState => ({
  phase: 'idle',
  capabilityAdvertised: false,
  capEndSent: false,
  offeredCapabilities: new Set<string>(),
  pendingCapabilities: new Set<string>(),
});

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

export const handleRegistrationAuthLine = (
  connection: IrcRegistrationContext,
  command: string,
  params: string[]
) => {
  if (command === 'CAP') {
    return handleCapLine(connection, params);
  }
  if (command === '421' && (params[1] ?? '').toUpperCase() === 'CAP') {
    emitStatus(connection, 'Server does not support CAP negotiation; continuing without modern capabilities', 'notice');
    finishSaslNegotiation(connection, { sendCapEnd: false });
    return true;
  }
  if (command === 'AUTHENTICATE') {
    return handleAuthenticateLine(connection, params);
  }
  if (command === '900') {
    return handleAccountLoginSuccess(connection, params);
  }
  if (saslSuccessCommands.has(command)) {
    return handleSaslSuccess(connection, command, params);
  }
  if (saslFailureCommands.has(command)) {
    return handleSaslFailure(connection, command, params);
  }
  return false;
};

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

const handleCapLine = (connection: IrcRegistrationContext, params: string[]) => {
  const { sasl } = connection.lifecycle;
  if (sasl.phase === 'idle' || sasl.phase === 'completed') {
    return false;
  }
  const subcommand = params[1]?.toUpperCase();
  if (subcommand === 'LS') {
    return handleCapList(connection, params);
  }
  if (subcommand === 'ACK') {
    return handleCapAck(connection, params);
  }
  if (subcommand === 'NAK') {
    return handleCapNak(connection, params);
  }
  return false;
};

const handleCapList = (connection: IrcRegistrationContext, params: string[]) => {
  const { sasl } = connection.lifecycle;
  if (sasl.phase !== 'awaiting-cap-list') {
    return false;
  }
  const tokens = parseCapabilityTokens(params.at(-1));
  recordAdvertisedCapabilities(sasl.offeredCapabilities, tokens);
  recordAdvertisedCapabilities(connection.lifecycle.capabilities.offered, tokens);
  if ([...sasl.offeredCapabilities].some((capability) => normalizeCapabilityName(capability) === 'sasl')) {
    sasl.capabilityAdvertised = true;
  }
  if (params[2] === '*') {
    return true;
  }
  const requestedCapabilities = resolveRequestedCapabilities(connection.profile, sasl.offeredCapabilities);
  if (requestedCapabilities.size === 0) {
    if (usesSaslPlain(connection.profile) && !sasl.capabilityAdvertised) {
      emitStatus(connection, 'Server does not advertise SASL; continuing without it', 'error');
    }
    finishSaslNegotiation(connection);
    return true;
  }
  const requestLine = `CAP REQ :${Array.from(requestedCapabilities).join(' ')}`;
  if (connection.sendRaw(requestLine)) {
    sasl.pendingCapabilities = requestedCapabilities;
    connection.lifecycle.capabilities.pendingRequest = new Set(requestedCapabilities);
    sasl.phase = 'awaiting-cap-ack';
  }
  return true;
};

const handleCapAck = (connection: IrcRegistrationContext, params: string[]) => {
  const { sasl } = connection.lifecycle;
  if (sasl.phase !== 'awaiting-cap-ack') {
    return false;
  }
  const tokens = parseCapabilityTokens(params.at(-1));
  applyAcknowledgedCapabilities(connection.lifecycle.capabilities, tokens);
  for (const token of tokens) {
    const name = normalizeCapabilityName(token);
    if (name) {
      sasl.pendingCapabilities.delete(name);
    }
  }
  if (sasl.pendingCapabilities.size > 0) {
    return true;
  }
  if (usesSaslPlain(connection.profile) && connection.lifecycle.capabilities.negotiated.has('sasl') && connection.sendRaw('AUTHENTICATE PLAIN')) {
    sasl.phase = 'awaiting-authenticate-challenge';
    return true;
  }
  finishSaslNegotiation(connection);
  return true;
};

const handleCapNak = (connection: IrcRegistrationContext, params: string[]) => {
  const { sasl } = connection.lifecycle;
  if (sasl.phase !== 'awaiting-cap-ack') {
    return false;
  }
  const tokens = parseCapabilityTokens(params.at(-1));
  for (const token of tokens) {
    const name = normalizeCapabilityName(token);
    if (name) {
      sasl.pendingCapabilities.delete(name);
      connection.lifecycle.capabilities.pendingRequest.delete(name);
    }
  }
  emitStatus(
    connection,
    params.at(-1)
      ? `Server rejected requested capabilities (${params.at(-1)})`
      : 'Server rejected requested capabilities',
    'error'
  );
  finishSaslNegotiation(connection);
  return true;
};

const handleAuthenticateLine = (connection: IrcRegistrationContext, params: string[]) => {
  const { sasl } = connection.lifecycle;
  if (sasl.phase !== 'awaiting-authenticate-challenge') {
    return false;
  }
  if ((params[0] ?? '') !== '+') {
    emitStatus(connection, 'Server rejected SASL PLAIN authentication; continuing without it', 'error');
    finishSaslNegotiation(connection);
    return true;
  }
  const lines = buildSaslAuthenticateLines(connection.profile);
  if (lines.every((line) => connection.sendRaw(line))) {
    sasl.phase = 'awaiting-authenticate-result';
  }
  return true;
};

const handleSaslSuccess = (connection: IrcRegistrationContext, command: string, params: string[]) => {
  const { sasl } = connection.lifecycle;
  if (sasl.phase === 'idle' || sasl.phase === 'completed') {
    return false;
  }
  if (command === '900') {
    emitStatus(connection, params.at(-1) || 'SASL authentication accepted');
    finishSaslNegotiation(connection);
    return true;
  }
  emitStatus(connection, command === '907' ? 'SASL authentication already active' : 'SASL authentication succeeded');
  finishSaslNegotiation(connection);
  return true;
};

const handleSaslFailure = (connection: IrcRegistrationContext, _command: string, params: string[]) => {
  const { sasl } = connection.lifecycle;
  if (sasl.phase === 'idle' || sasl.phase === 'completed') {
    return false;
  }
  emitStatus(connection, params.at(-1) || 'SASL authentication failed', 'error');
  finishSaslNegotiation(connection);
  return true;
};

const handleAccountLoginSuccess = (connection: IrcRegistrationContext, params: string[]) => {
  connection.lifecycle.accountName = params[2] ?? connection.lifecycle.accountName;
  const handledSasl = handleSaslSuccess(connection, '900', params);
  const handledNickserv = handleNickservAccountLogin(connection);
  return handledSasl || handledNickserv;
};

const handleNickservAccountLogin = (connection: IrcRegistrationContext) =>
  completeDeferredNickservAutoJoin(connection);

const buildServerPassLines = (profile: RuntimeNetworkProfile) => {
  const authMethod = resolveNetworkAuthMethod(profile);
  return authMethod === 'server-pass' && profile.password
    ? [`PASS ${profile.password}`]
    : [];
};

const buildCapabilityNegotiationLines = (profile: RuntimeNetworkProfile) =>
  shouldUseCapabilityNegotiation(profile) ? ['CAP LS 302'] : [];

const usesNickServ = (profile: RuntimeNetworkProfile) =>
  resolveNetworkAuthMethod(profile) === 'nickserv' && Boolean(profile.password);

const finishSaslNegotiation = (
  connection: IrcRegistrationContext,
  options: { sendCapEnd?: boolean } = {}
) => {
  const { sasl } = connection.lifecycle;
  if (options.sendCapEnd !== false && !sasl.capEndSent) {
    sasl.capEndSent = connection.sendRaw('CAP END');
  } else if (options.sendCapEnd === false) {
    sasl.capEndSent = true;
  }
  sasl.phase = 'completed';
  sasl.pendingCapabilities.clear();
  connection.lifecycle.capabilities.pendingRequest.clear();
};

const getWelcomeSaslFallbackMessage = (phase: IrcSaslPhase) => {
  switch (phase) {
    case 'awaiting-cap-list':
      return 'Server completed registration before replying to CAP LS; continuing without negotiated capabilities';
    case 'awaiting-cap-ack':
    case 'awaiting-authenticate-challenge':
    case 'awaiting-authenticate-result':
      return 'Server completed registration before capability negotiation finished; continuing without it';
    case 'idle':
    case 'completed':
      return null;
  }
};

const buildSaslAuthenticateLines = (profile: RuntimeNetworkProfile) => {
  const payload = Buffer.from(`\u0000${resolveNetworkAuthAccount(profile)}\u0000${profile.password ?? ''}`, 'utf8').toString('base64');
  const chunks = chunkSaslPayload(payload);
  return chunks.map((chunk) => `AUTHENTICATE ${chunk}`);
};

const chunkSaslPayload = (payload: string) => {
  const chunks: string[] = [];
  for (let index = 0; index < payload.length; index += saslChunkSize) {
    chunks.push(payload.slice(index, index + saslChunkSize));
  }
  if (chunks.length === 0) {
    return ['+'];
  }
  if (payload.length % saslChunkSize === 0) {
    chunks.push('+');
  }
  return chunks;
};

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

const shouldUseCapabilityNegotiation = (profile: RuntimeNetworkProfile) =>
  true;
