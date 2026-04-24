import { tokenizeFormattedMessage, tokenizeStrippedMessage } from './formatted-message.js';
import { collectInlineImageHrefs, isInlineImageHref } from './formatted-message-inline-images.js';
import { escapeIrcTextForDebug } from './irc-format.js';
import type { MessageDisplayMode } from './message-display-mode.js';

export type ParsedFormattedMessageContent = {
  inlineImageHrefs: string[];
  rawMode: boolean;
  rawText: string;
  tokens: ReturnType<typeof tokenizeFormattedMessage>;
};

export const parseFormattedMessageContent = (
  text: string,
  mode: MessageDisplayMode | undefined,
): ParsedFormattedMessageContent => {
  if (mode === 'raw') {
    return {
      inlineImageHrefs: [],
      rawMode: true,
      rawText: escapeIrcTextForDebug(text),
      tokens: [],
    };
  }
  const tokens = mode === 'stripped'
    ? tokenizeStrippedMessage(text)
    : tokenizeFormattedMessage(text);
  return {
    inlineImageHrefs: collectInlineImageHrefs(tokens),
    rawMode: false,
    rawText: '',
    tokens,
  };
};

export const hasVisibleFormattedMessageText = (content: ParsedFormattedMessageContent) => {
  if (content.rawMode) {
    return content.rawText.trim().length > 0;
  }
  return content.tokens.some((token) => {
    if (token.type === 'text' || token.type === 'channel') {
      return token.parts.some((part) => part.text.trim().length > 0);
    }
    return !isInlineImageHref(token.href) && token.parts.some((part) => part.text.trim().length > 0);
  });
};
