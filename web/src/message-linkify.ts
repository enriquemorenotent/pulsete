export type MessageTextToken =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; href: string; external: boolean }
  | { type: 'channel'; value: string; channel: string };

export type MessageLinkMatch =
  | { type: 'link'; start: number; end: number; value: string; href: string; external: boolean }
  | { type: 'channel'; start: number; end: number; value: string; channel: string };

type MessageLinkDescriptor =
  | { type: 'link'; value: string; href: string; external: boolean }
  | { type: 'channel'; value: string; channel: string };

const candidatePattern =
  /((?:https?:\/\/|www\.)[^\s<]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|[#&+!][^\s<]+)/gi;

const emailPattern = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const channelPattern = /^[#&+!][^\s,:]+$/;

export function linkifyMessageText(text: string): MessageTextToken[] {
  const matches = findMessageLinkMatches(text);
  if (matches.length === 0) {
    return [{ type: 'text', value: text }];
  }

  const tokens: MessageTextToken[] = [];
  let lastIndex = 0;
  for (const match of matches) {
    if (match.start > lastIndex) {
      pushTextToken(tokens, text.slice(lastIndex, match.start));
    }
    if (match.type === 'channel') {
      tokens.push({
        type: 'channel',
        value: match.value,
        channel: match.channel,
      });
    } else {
      tokens.push({
        type: 'link',
        value: match.value,
        href: match.href,
        external: match.external,
      });
    }
    lastIndex = match.end;
  }

  if (lastIndex < text.length) {
    pushTextToken(tokens, text.slice(lastIndex));
  }

  return tokens;
}

export function findMessageLinkMatches(text: string): MessageLinkMatch[] {
  const matches: MessageLinkMatch[] = [];

  for (const match of text.matchAll(candidatePattern)) {
    const index = match.index ?? 0;
    const rawCandidate = match[0];
    const { value } = trimTrailingPunctuation(rawCandidate);
    const link = toMatch(text, index, value);

    if (!link) {
      continue;
    }
    matches.push({
      ...link,
      start: index,
      end: index + value.length,
    });
  }

  return matches;
}

function toMatch(text: string, index: number, value: string): MessageLinkDescriptor | null {
  if (channelPattern.test(value) && hasChannelBoundary(text, index)) {
    return {
      type: 'channel',
      value,
      channel: value,
    };
  }

  if (emailPattern.test(value)) {
    return {
      type: 'link',
      value,
      href: `mailto:${value}`,
      external: false,
    };
  }

  const href = value.startsWith('www.') ? `https://${value}` : value;

  try {
    const parsed = new URL(href);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return {
      type: 'link',
      value,
      href,
      external: true,
    };
  } catch {
    return null;
  }
}

function hasChannelBoundary(text: string, index: number) {
  if (index === 0) {
    return true;
  }
  return /[\s([{<"'`.,;:!?]/.test(text[index - 1] ?? '');
}

function trimTrailingPunctuation(value: string) {
  let end = value.length;

  while (end > 0) {
    const char = value[end - 1];
    if (/[.,!?;:]/.test(char)) {
      end -= 1;
      continue;
    }
    if (isUnmatchedCloser(value.slice(0, end), '(', ')') && char === ')') {
      end -= 1;
      continue;
    }
    if (isUnmatchedCloser(value.slice(0, end), '[', ']') && char === ']') {
      end -= 1;
      continue;
    }
    if (isUnmatchedCloser(value.slice(0, end), '{', '}') && char === '}') {
      end -= 1;
      continue;
    }
    break;
  }

  return {
    value: value.slice(0, end),
    trailing: value.slice(end),
  };
}

function isUnmatchedCloser(value: string, opener: string, closer: string) {
  return countChar(value, closer) > countChar(value, opener);
}

function countChar(value: string, char: string) {
  let count = 0;
  for (const current of value) {
    if (current === char) {
      count += 1;
    }
  }
  return count;
}

function pushTextToken(tokens: MessageTextToken[], value: string) {
  if (!value) {
    return;
  }
  const previous = tokens.at(-1);
  if (previous?.type === 'text') {
    previous.value += value;
    return;
  }
  tokens.push({ type: 'text', value });
}
