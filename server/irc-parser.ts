import { parseChannelUser } from '../shared/channel-users.js';
import { parseIrcMessageTags, type IrcMessageTags } from './irc-message-tags.js';
export { findIrcCaseMatch, isSameIrcIdentifier } from '../shared/irc-identifiers.js';

export type ParsedLine = {
  tags: IrcMessageTags;
  prefix: string | null;
  command: string;
  params: string[];
};

export const parseLine = (line: string): ParsedLine => {
  let rest = line.trimEnd();
  let tags: IrcMessageTags = {};
  if (rest.startsWith('@')) {
    const spaceIndex = rest.indexOf(' ');
    if (spaceIndex === -1) {
      return { tags: parseIrcMessageTags(rest.slice(1)), prefix: null, command: '', params: [] };
    }
    tags = parseIrcMessageTags(rest.slice(1, spaceIndex));
    rest = rest.slice(spaceIndex + 1).trimStart();
  }
  let prefix: string | null = null;
  if (rest.startsWith(':')) {
    const spaceIndex = rest.indexOf(' ');
    if (spaceIndex === -1) {
      return { tags, prefix: rest.slice(1), command: '', params: [] };
    }
    prefix = rest.slice(1, spaceIndex);
    rest = rest.slice(spaceIndex + 1).trimStart();
  }
  const commandEnd = rest.indexOf(' ');
  const command = commandEnd === -1 ? rest : rest.slice(0, commandEnd);
  rest = commandEnd === -1 ? '' : rest.slice(commandEnd + 1);
  const params: string[] = [];
  while (rest.length > 0) {
    rest = rest.trimStart();
    if (rest.length === 0) {
      break;
    }
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
  return { tags, prefix, command, params };
};

export const nickFromPrefix = (prefix: string | null) => {
  if (!prefix) {
    return null;
  }
  return prefix.split('!')[0] ?? prefix;
};

export const parsePrefixIdentity = (prefix: string | null) => {
  if (!prefix) {
    return { nick: null, username: null, host: null };
  }
  const [nickPart, rest = ''] = prefix.split('!', 2);
  const [usernamePart, hostPart = ''] = rest.split('@', 2);
  return {
    nick: nickPart || null,
    username: usernamePart || null,
    host: hostPart || null,
  };
};

export const stripCtcp = (text: string) => {
  if (!text.startsWith('\u0001') || !text.endsWith('\u0001')) {
    return null;
  }
  return text.slice(1, -1);
};

export const parseChannelUserToken = (value: string) => parseChannelUser(value);
export const isChannelTarget = (value: string) => /^[#&+!]/.test(value);
