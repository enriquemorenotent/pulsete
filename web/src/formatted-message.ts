import { getVisibleIrcText, parseIrcFormatting, type IrcFormattedRun, type IrcTextStyle } from './irc-format.js';
import { findMessageLinkMatches, type MessageLinkMatch } from './message-linkify.js';

export type MessageTextPart = {
  text: string;
  style: IrcTextStyle;
};

export type FormattedMessageToken =
  | { type: 'text'; parts: MessageTextPart[] }
  | { type: 'link'; parts: MessageTextPart[]; href: string; external: boolean }
  | { type: 'channel'; parts: MessageTextPart[]; channel: string };

type PositionedRun = IrcFormattedRun & {
  start: number;
  end: number;
};

export const tokenizeFormattedMessage = (text: string): FormattedMessageToken[] => {
  const runs = positionRuns(parseIrcFormatting(text));
  const visibleText = runs.map((run) => run.text).join('');
  if (!visibleText) {
    return [];
  }

  const matches = findMessageLinkMatches(visibleText);
  if (runs.length === 0) {
    return matchesToFallbackTokens(visibleText, matches);
  }

  const boundaries = new Set<number>([0, visibleText.length]);
  for (const run of runs) {
    boundaries.add(run.start);
    boundaries.add(run.end);
  }
  for (const match of matches) {
    boundaries.add(match.start);
    boundaries.add(match.end);
  }

  const sorted = Array.from(boundaries).sort((left, right) => left - right);
  const tokens: FormattedMessageToken[] = [];
  let runIndex = 0;
  let matchIndex = 0;

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index]!;
    const end = sorted[index + 1]!;
    if (start === end) {
      continue;
    }

    while (runIndex < runs.length && runs[runIndex]!.end <= start) {
      runIndex += 1;
    }
    while (matchIndex < matches.length && matches[matchIndex]!.end <= start) {
      matchIndex += 1;
    }

    const run = runs[runIndex];
    if (!run || start < run.start || end > run.end) {
      continue;
    }

    const match = matches[matchIndex];
    const part: MessageTextPart = {
      text: visibleText.slice(start, end),
      style: run.style,
    };

    if (match && start >= match.start && end <= match.end) {
      pushLinkedPart(tokens, match, part);
      continue;
    }
    pushTextPart(tokens, part);
  }

  return tokens;
};

export const tokenizeStrippedMessage = (text: string) => tokenizePlainMessage(getVisibleIrcText(text));

const positionRuns = (runs: IrcFormattedRun[]): PositionedRun[] => {
  let index = 0;
  return runs.map((run) => {
    const positioned = {
      ...run,
      start: index,
      end: index + run.text.length,
    };
    index = positioned.end;
    return positioned;
  });
};

const tokenizePlainMessage = (text: string) => matchesToFallbackTokens(text, findMessageLinkMatches(text));

const matchesToFallbackTokens = (text: string, matches: MessageLinkMatch[]) => {
  const tokens: FormattedMessageToken[] = [];
  let lastIndex = 0;
  for (const match of matches) {
    if (match.start > lastIndex) {
      pushTextPart(tokens, { text: text.slice(lastIndex, match.start), style: emptyStyle });
    }
    const part = {
      text: text.slice(match.start, match.end),
      style: emptyStyle,
    };
    pushLinkedPart(tokens, match, part);
    lastIndex = match.end;
  }
  if (lastIndex < text.length) {
    pushTextPart(tokens, { text: text.slice(lastIndex), style: emptyStyle });
  }
  return tokens;
};

const emptyStyle: IrcTextStyle = {
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  monospace: false,
  reverse: false,
  foregroundColor: null,
  backgroundColor: null,
};

const pushLinkedPart = (tokens: FormattedMessageToken[], match: MessageLinkMatch, part: MessageTextPart) => {
  const previous = tokens.at(-1);
  if (match.type === 'channel') {
    if (previous?.type === 'channel' && previous.channel === match.channel) {
      pushPart(previous.parts, part);
      return;
    }
    tokens.push({
      type: 'channel',
      channel: match.channel,
      parts: [part],
    });
    return;
  }

  if (previous?.type === 'link' && previous.href === match.href && previous.external === match.external) {
    pushPart(previous.parts, part);
    return;
  }
  tokens.push({
    type: 'link',
    href: match.href,
    external: match.external,
    parts: [part],
  });
};

const pushTextPart = (tokens: FormattedMessageToken[], part: MessageTextPart) => {
  const previous = tokens.at(-1);
  if (previous?.type !== 'text') {
    tokens.push({
      type: 'text',
      parts: [part],
    });
    return;
  }
  pushPart(previous.parts, part);
};

const pushPart = (parts: MessageTextPart[], part: MessageTextPart) => {
  if (!part.text) {
    return;
  }
  const previous = parts.at(-1);
  if (previous && stylesEqual(previous.style, part.style)) {
    previous.text += part.text;
    return;
  }
  parts.push(part);
};

const stylesEqual = (left: IrcTextStyle, right: IrcTextStyle) =>
  left.bold === right.bold &&
  left.italic === right.italic &&
  left.underline === right.underline &&
  left.strikethrough === right.strikethrough &&
  left.monospace === right.monospace &&
  left.reverse === right.reverse &&
  left.foregroundColor === right.foregroundColor &&
  left.backgroundColor === right.backgroundColor;
