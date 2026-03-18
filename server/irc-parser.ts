import type { ParsedLine } from './irc-types.js';

const ircCaseFoldMap: Record<string, string> = {
  '[': '{',
  ']': '}',
  '\\': '|',
  '^': '~',
};

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
export const normalizeIrcIdentifier = (value: string) =>
  value.replace(/[A-Z[\]\\^]/g, (character) => ircCaseFoldMap[character] ?? character.toLowerCase());

export const isSameIrcIdentifier = (left: string | null, right: string | null) =>
  left !== null && right !== null && normalizeIrcIdentifier(left) === normalizeIrcIdentifier(right);

export const findIrcCaseMatch = <T extends string>(values: Iterable<T>, value: string) => {
  const normalizedValue = normalizeIrcIdentifier(value);
  for (const candidate of values) {
    if (normalizeIrcIdentifier(candidate) === normalizedValue) {
      return candidate;
    }
  }
  return null;
};
