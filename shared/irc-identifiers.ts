const ircCaseFoldMap: Record<string, string> = {
  '[': '{',
  ']': '}',
  '\\': '|',
  '^': '~',
};

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
