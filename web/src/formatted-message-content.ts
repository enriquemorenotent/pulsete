import { tokenizeFormattedMessage, tokenizeStrippedMessage } from './formatted-message.js';
import {
  collectInlineMedia,
  isInlineMediaHref,
  type InlineMedia,
} from './formatted-message-inline-media.js';
import { escapeIrcTextForDebug } from './irc-format.js';
import type { MessageDisplayMode } from './message-display-mode.js';

export type ParsedFormattedMessageContent = {
  inlineMedia: InlineMedia[];
  pagePreviewHrefs: string[];
  rawMode: boolean;
  rawText: string;
  tokens: ReturnType<typeof tokenizeFormattedMessage>;
};

export type InlineImageRenderingMode = 'hidden' | 'link' | 'preview';

export const parseFormattedMessageContent = (
  text: string,
  mode: MessageDisplayMode | undefined,
): ParsedFormattedMessageContent => {
  if (mode === 'raw') {
    return {
      inlineMedia: [],
      pagePreviewHrefs: [],
      rawMode: true,
      rawText: escapeIrcTextForDebug(text),
      tokens: [],
    };
  }
  const tokens = mode === 'stripped'
    ? tokenizeStrippedMessage(text)
    : tokenizeFormattedMessage(text);
  return {
    inlineMedia: collectInlineMedia(tokens),
    pagePreviewHrefs: collectPagePreviewHrefs(tokens),
    rawMode: false,
    rawText: '',
    tokens,
  };
};

const collectPagePreviewHrefs = (
  tokens: ReturnType<typeof tokenizeFormattedMessage>,
) => {
  const hrefs: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    if (
      token.type !== 'link'
      || isInlineMediaHref(token.href)
      || seen.has(token.href)
      || !isHttpUrl(token.href)
    ) {
      continue;
    }
    seen.add(token.href);
    hrefs.push(token.href);
    if (hrefs.length === pagePreviewHrefLimit) {
      break;
    }
  }
  return hrefs;
};

const isHttpUrl = (href: string) => {
  try {
    const url = new URL(href);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const pagePreviewHrefLimit = 3;

export const hasVisibleFormattedMessageText = (
  content: ParsedFormattedMessageContent,
  options: { inlineImageRendering?: InlineImageRenderingMode } = {},
) => {
  if (content.rawMode) {
    return content.rawText.trim().length > 0;
  }
  const inlineImageRendering = options.inlineImageRendering ?? 'preview';
  return content.tokens.some((token) => {
    if (token.type === 'text' || token.type === 'channel') {
      return token.parts.some((part) => part.text.trim().length > 0);
    }
    return (
      (!isInlineMediaHref(token.href) || inlineImageRendering === 'link')
      && token.parts.some((part) => part.text.trim().length > 0)
    );
  });
};
