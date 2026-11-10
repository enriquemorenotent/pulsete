import type { IrcCaseMapping } from './irc-server-rules.js';
const ircCaseFoldMap: Record<string, string> = {
  '[': '{',
  ']': '}',
  '\\': '|',
  '^': '~',
};

export const normalizeIrcIdentifier = (value: string, mapping: IrcCaseMapping = 'rfc1459') =>
  value.replace(/[A-Z[\]\\^]/g, character => {
    if (mapping === 'ascii' || (mapping === 'rfc1459-strict' && character === '^')) return character.toLowerCase();
    return ircCaseFoldMap[character] ?? character.toLowerCase();
  });

export const isSameIrcIdentifier = (left: string | null, right: string | null, mapping: IrcCaseMapping = 'rfc1459') =>
  left !== null && right !== null && normalizeIrcIdentifier(left, mapping) === normalizeIrcIdentifier(right, mapping);

export const findIrcCaseMatch = <T extends string>(values: Iterable<T>, value: string, mapping: IrcCaseMapping = 'rfc1459') => {
  const normalizedValue = normalizeIrcIdentifier(value, mapping);
  for (const candidate of values) {
    if (normalizeIrcIdentifier(candidate, mapping) === normalizedValue) {
      return candidate;
    }
  }
  return null;
};
