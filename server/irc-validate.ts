import { badRequest } from './app-error.js';

const lineBreakPattern = /[\r\n]/;
const whitespacePattern = /\s/;
const channelTargetPattern = /^[#&+!]/;

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
  return target;
};

export const normalizeQueryTarget = (value: string) => {
  const target = value.trim();
  if (!target || target === 'server' || channelTargetPattern.test(target) || whitespacePattern.test(target)) {
    throw badRequest('Private-message target is required');
  }
  return target;
};

export const normalizeMessageTarget = (value: string) =>
  channelTargetPattern.test(value.trim()) ? normalizeChannelTarget(value) : normalizeQueryTarget(value);

export const normalizeMessageBody = (value: string) =>
  requireSingleLineValue(value, 'Message body cannot contain carriage returns or line feeds');

export const normalizeRawCommand = (value: string) =>
  requireSingleLineValue(value, 'Raw command cannot contain carriage returns or line feeds');
