import { badRequest } from './app-error.js';
import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import { maxIsonNickBytes } from './irc-limits.js';

const lineBreakPattern = /[\r\n]/;
const whitespacePattern = /\s/;
const channelTargetPattern = /^[#&+!]/;
const multiTargetPattern = /,/;

const requireSingleLine = (value: string, message: string) => {
  if (lineBreakPattern.test(value)) {
    throw badRequest(message);
  }
  return value;
};

export const requireIrcToken = (value: string, message: string) => {
  requireSingleLine(value, message);
  if (!value || whitespacePattern.test(value)) {
    throw badRequest(message);
  }
  return value;
};

export const requireSingleLineValue = (value: string, message: string) =>
  requireSingleLine(value, message);

export const normalizeChannelTarget = (value: string) => {
  const target = value.trim();
  if (!target || !channelTargetPattern.test(target) || whitespacePattern.test(target)) {
    throw badRequest('Channel name must start with #, &, +, or !');
  }
  if (multiTargetPattern.test(target)) {
    throw badRequest('Channel name must refer to a single channel');
  }
  return target;
};

const normalizeSingleNickTarget = (
  value: string,
  messages: {
    requiredMessage: string;
    singleTargetMessage: string;
  }
) => {
  const target = value.trim();
  if (
    !target
    || normalizeIrcIdentifier(target) === normalizeIrcIdentifier('server')
    || channelTargetPattern.test(target)
    || whitespacePattern.test(target)
  ) {
    throw badRequest(messages.requiredMessage);
  }
  if (multiTargetPattern.test(target)) {
    throw badRequest(messages.singleTargetMessage);
  }
  return target;
};

export const normalizeQueryTarget = (value: string) => normalizeSingleNickTarget(value, {
  requiredMessage: 'Private-message target is required',
  singleTargetMessage: 'Private-message target must refer to a single nick',
});

export const normalizeAuthTarget = (value: string) => normalizeSingleNickTarget(value, {
  requiredMessage: 'Authentication target must be a single nick',
  singleTargetMessage: 'Authentication target must refer to a single nick',
});

export const normalizeFriendNick = (value: string) => {
  const nick = normalizeQueryTarget(value);
  if (Buffer.byteLength(nick, 'utf8') > maxIsonNickBytes) {
    throw badRequest('Friend nick is too long');
  }
  return nick;
};

export const normalizeMessageTarget = (value: string) =>
  channelTargetPattern.test(value.trim()) ? normalizeChannelTarget(value) : normalizeQueryTarget(value);

export const normalizeMessageBody = (value: string) => {
  requireSingleLineValue(value, 'Message body cannot contain carriage returns or line feeds');
  if (value.trim().length === 0) {
    throw badRequest('Message body is required');
  }
  return value;
};

export const normalizeRawCommand = (value: string) => {
  requireSingleLineValue(value, 'Raw command cannot contain carriage returns or line feeds');
  if (value.trim().length === 0) {
    throw badRequest('Raw command is required');
  }
  return value;
};
