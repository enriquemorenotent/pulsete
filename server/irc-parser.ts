import type { ParsedLine } from './irc-types.js';

export const parseLine = (line: string): ParsedLine => {
  let rest = line.trimEnd();
  let prefix: string | null = null;
  if (rest.startsWith(':')) {
    const spaceIndex = rest.indexOf(' ');
    prefix = rest.slice(1, spaceIndex);
    rest = rest.slice(spaceIndex + 1);
  }
  const commandEnd = rest.indexOf(' ');
  const command = commandEnd === -1 ? rest : rest.slice(0, commandEnd);
  rest = commandEnd === -1 ? '' : rest.slice(commandEnd + 1);
  const params: string[] = [];
  while (rest.length > 0) {
    if (rest.startsWith(':')) {
      params.push(rest.slice(1));
      break;
    }
    const nextSpace = rest.indexOf(' ');
    if (nextSpace === -1) {
      params.push(rest);
      break;
    }
    params.push(rest.slice(0, nextSpace));
    rest = rest.slice(nextSpace + 1);
  }
  return { prefix, command, params };
};

export const nickFromPrefix = (prefix: string | null) => {
  if (!prefix) {
    return null;
  }
  return prefix.split('!')[0] ?? prefix;
};

export const stripCtcp = (text: string) => {
  if (!text.startsWith('\u0001') || !text.endsWith('\u0001')) {
    return null;
  }
  return text.slice(1, -1);
};

export const normalizeChannelUser = (value: string) => value.replace(/^[@+~&%]/, '');
export const isChannelTarget = (value: string) => /^[#&+!]/.test(value);
