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
