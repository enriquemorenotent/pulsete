import { isSameIrcIdentifier } from './irc-parser.js';

const wellKnownServiceNicks = new Set([
  'authserv',
  'botserv',
  'chanserv',
  'global',
  'helpserv',
  'hostserv',
  'memoserv',
  'nickserv',
  'operserv',
  'statserv',
]);

export const isServiceNick = (nick: string | null) => {
  if (!nick) {
    return false;
  }
  const normalized = nick.toLowerCase();
  return wellKnownServiceNicks.has(normalized) || /^[a-z][a-z0-9_-]*serv$/i.test(nick);
};

export const serviceNickFromTarget = (target: string | null) => {
  if (!target) {
    return null;
  }
  return target.split(/[!@]/, 1)[0] ?? target;
};

export const matchesServiceTargetNick = (nick: string | null, target: string | null) =>
  isSameIrcIdentifier(nick, serviceNickFromTarget(target));
