import { Fragment, memo, useMemo } from 'react';
import {
  parseFormattedMessageContent,
  type InlineImageRenderingMode,
  type ParsedFormattedMessageContent,
} from './formatted-message-content.js';
import { isInlineMediaHref } from './formatted-message-inline-media.js';
import { renderFormattedMessageParts } from './formatted-message-render-parts.js';
import { FormattedMessageInlinePreviews } from './FormattedMessageInlinePreviews.js';
import type { MessageDisplayMode } from './message-display-mode.js';

export {
  hasVisibleFormattedMessageText,
  parseFormattedMessageContent,
} from './formatted-message-content.js';
export type { ParsedFormattedMessageContent } from './formatted-message-content.js';
export type { InlineImageRenderingMode } from './formatted-message-content.js';
export { FormattedMessageInlinePreviews } from './FormattedMessageInlinePreviews.js';
export { InlineImagePreviewDialogBody } from './InlineImagePreviewDialogBody.js';
export { InlineMediaPreviewDialogBody } from './InlineMediaPreviewDialogBody.js';

type FormattedMessageTextProps = {
  inlineImageRendering?: InlineImageRenderingMode;
  onInlinePreviewLoad?: () => void;
  parsedContent?: ParsedFormattedMessageContent;
  renderInlinePreviews?: boolean;
  text: string;
  onOpenChannel: (channel: string) => void;
  mode?: MessageDisplayMode;
};

export const FormattedMessageText = memo(function FormattedMessageText(props: FormattedMessageTextProps) {
  const memoizedContent = useMemo(
    () => parseFormattedMessageContent(props.text, props.mode),
    [props.mode, props.text]
  );
  const content = props.parsedContent ?? memoizedContent;
  const inlineImageRendering = props.inlineImageRendering ?? 'preview';

  if (content.rawMode) {
    return <span className="font-mono">{content.rawText}</span>;
  }

  return (
    <>
      {content.tokens.map((token, tokenIndex) => {
        const renderedContent = renderFormattedMessageParts(
          token.parts,
          token.type !== 'text',
          tokenIndex,
        );
        if (token.type === 'text') {
          return <Fragment key={`text-${tokenIndex}`}>{renderedContent}</Fragment>;
        }
        if (token.type === 'channel') {
          return (
            <button
              key={`channel-${token.channel}-${tokenIndex}`}
              type="button"
              onClick={() => props.onOpenChannel(token.channel)}
              className="cursor-pointer appearance-none border-0 bg-transparent p-0 align-baseline font-medium text-primary/90 underline decoration-primary/35 decoration-1 underline-offset-2 transition-colors hover:text-primary hover:decoration-primary/80 hover:opacity-90"
            >
              {renderedContent}
            </button>
          );
        }
        if (isInlineMediaHref(token.href) && inlineImageRendering !== 'link') {
          return null;
        }
        return (
          <a
            key={`link-${token.href}-${tokenIndex}`}
            href={token.href}
            target={token.external ? '_blank' : undefined}
            rel={token.external ? 'noreferrer' : undefined}
            className="font-medium text-primary/90 underline decoration-primary/35 decoration-1 underline-offset-2 transition-colors hover:text-primary hover:decoration-primary/80 hover:opacity-90"
          >
            {renderedContent}
          </a>
        );
      })}
      {props.renderInlinePreviews === false || inlineImageRendering !== 'preview' ? null : (
        <FormattedMessageInlinePreviews
          media={content.inlineMedia}
          onInlinePreviewLoad={props.onInlinePreviewLoad}
        />
      )}
    </>
  );
});
