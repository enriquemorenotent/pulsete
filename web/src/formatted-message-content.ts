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
    rawMode: false,
    rawText: '',
    tokens,
  };
};

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
