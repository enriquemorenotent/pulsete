import { emitState, emitStatus } from './irc-emit.js';
import { applyAcknowledgedCapabilities, normalizeCapabilityName, parseCapabilityTokens, recordAdvertisedCapabilities, resolveRequestedCapabilities, usesSaslPlain } from './irc-capabilities.js';
import { resolveNetworkAuthAccount, resolveNetworkAuthMethod } from '../shared/network-model.js';
import type { IrcRegistrationContext } from './irc-contexts.js';
import type { IrcSaslPhase, IrcSaslState } from './irc-state-types.js';
import type { RuntimeNetworkProfile } from './storage-types.js';

const saslChunkSize = 400;
const saslSuccessCommands = new Set(['903', '907']);
const saslFailureCommands = new Set(['904', '905', '906', '908']);

export const createIdleSaslState = (): IrcSaslState => ({
  phase: 'idle',
  capabilityAdvertised: false,
  capEndSent: false,
  offeredCapabilities: new Set<string>(),
  pendingCapabilities: new Set<string>(),
});

export const handleRegistrationAuthLine = (connection: IrcRegistrationContext, command: string, params: string[]) => {
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
  return saslFailureCommands.has(command) ? handleSaslFailure(connection, params) : false;
};

export const buildServerPassLines = (profile: RuntimeNetworkProfile) =>
  resolveNetworkAuthMethod(profile) === 'server-pass' && profile.password ? [`PASS :${profile.password}`] : [];

export const buildCapabilityNegotiationLines = (_profile: RuntimeNetworkProfile) => ['CAP LS 302'];

export const finishSaslNegotiation = (connection: IrcRegistrationContext, options: { sendCapEnd?: boolean } = {}) => {
  const { sasl } = connection.lifecycle;
  if (options.sendCapEnd !== false && !sasl.capEndSent) {
    sasl.capEndSent = connection.sendRaw('CAP END');
  } else if (options.sendCapEnd === false) {
    sasl.capEndSent = true;
  }
  sasl.phase = 'completed';
  sasl.pendingCapabilities.clear();
  connection.lifecycle.capabilities.pendingRequest.clear();
  emitState(connection);
};

export const getWelcomeSaslFallbackMessage = (phase: IrcSaslPhase) => {
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

const handleCapLine = (connection: IrcRegistrationContext, params: string[]) => {
  const { sasl } = connection.lifecycle;
  if (sasl.phase === 'idle' || sasl.phase === 'completed') {
    return false;
  }
  switch (params[1]?.toUpperCase()) {
    case 'LS':
      return handleCapList(connection, params);
    case 'ACK':
      return handleCapAck(connection, params);
    case 'NAK':
      return handleCapNak(connection, params);
    default:
      return false;
  }
};

const handleCapList = (connection: IrcRegistrationContext, params: string[]) => {
  const { sasl } = connection.lifecycle;
  if (sasl.phase !== 'awaiting-cap-list') {
    return false;
  }
  const tokens = parseCapabilityTokens(params.at(-1));
  recordAdvertisedCapabilities(sasl.offeredCapabilities, tokens);
  recordAdvertisedCapabilities(connection.lifecycle.capabilities.offered, tokens);
  emitState(connection);
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
  if (usesSaslPlain(connection.profile) && !sasl.capabilityAdvertised) {
    emitStatus(connection, 'Server does not advertise SASL; continuing without it', 'error');
  }
  if (connection.sendRaw(`CAP REQ :${Array.from(requestedCapabilities).join(' ')}`)) {
    sasl.pendingCapabilities = requestedCapabilities;
    connection.lifecycle.capabilities.pendingRequest = new Set(requestedCapabilities);
    sasl.phase = 'awaiting-cap-ack';
    emitState(connection);
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
  emitState(connection);
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
  emitState(connection);
  emitStatus(connection, params.at(-1) ? `Server rejected requested capabilities (${params.at(-1)})` : 'Server rejected requested capabilities', 'error');
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
  if (buildSaslAuthenticateLines(connection.profile).every((line) => connection.sendRaw(line))) {
    sasl.phase = 'awaiting-authenticate-result';
  }
  return true;
};

const handleSaslSuccess = (connection: IrcRegistrationContext, command: string, params: string[]) => {
  const { sasl } = connection.lifecycle;
  if (sasl.phase === 'idle' || sasl.phase === 'completed') {
    return false;
  }
  emitStatus(connection, command === '900' ? params.at(-1) || 'SASL authentication accepted' : command === '907' ? 'SASL authentication already active' : 'SASL authentication succeeded');
  finishSaslNegotiation(connection);
  return true;
};

const handleSaslFailure = (connection: IrcRegistrationContext, params: string[]) => {
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
  return handleSaslSuccess(connection, '900', params);
};

const buildSaslAuthenticateLines = (profile: RuntimeNetworkProfile) =>
  chunkSaslPayload(Buffer.from(`\u0000${resolveNetworkAuthAccount(profile)}\u0000${profile.password ?? ''}`, 'utf8').toString('base64'))
    .map((chunk) => `AUTHENTICATE ${chunk}`);

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
