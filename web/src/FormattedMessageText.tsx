import { Fragment, memo, useMemo, type CSSProperties } from 'react';
import { tokenizeFormattedMessage, tokenizeStrippedMessage, type MessageTextPart } from './formatted-message.js';
import { escapeIrcTextForDebug } from './irc-format.js';
import type { MessageDisplayMode } from './message-display-mode.js';

export type ParsedFormattedMessageContent = {
  inlineImageHrefs: string[];
  rawMode: boolean;
  rawText: string;
  tokens: ReturnType<typeof tokenizeFormattedMessage>;
};

type FormattedMessageTextProps = {
  parsedContent?: ParsedFormattedMessageContent;
  renderInlinePreviews?: boolean;
  text: string;
  onOpenChannel: (channel: string) => void;
  mode?: MessageDisplayMode;
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

export const FormattedMessageInlinePreviews = memo(function FormattedMessageInlinePreviews(
  props: { hrefs: string[] },
) {
  if (props.hrefs.length === 0) {
    return null;
  }

  return (
    <span className="mt-2 flex flex-wrap gap-2">
      {props.hrefs.map((href) => (
        <a
          key={href}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="block max-w-full overflow-hidden rounded-sm border border-border/80 bg-card/70 p-1"
        >
          <img
            src={href}
            alt={buildImageAltText(href)}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="block max-h-80 max-w-full rounded-sm object-contain"
          />
        </a>
      ))}
    </span>
  );
});

export const FormattedMessageText = memo(function FormattedMessageText(props: FormattedMessageTextProps) {
  const memoizedContent = useMemo(
    () => parseFormattedMessageContent(props.text, props.mode),
    [props.mode, props.text]
  );
  const content = props.parsedContent ?? memoizedContent;

  if (content.rawMode) {
    return <span className="font-mono">{content.rawText}</span>;
  }

  return (
    <>
      {content.tokens.map((token, tokenIndex) => {
        const content = renderParts(token.parts, token.type !== 'text', tokenIndex);
        if (token.type === 'text') {
          return <Fragment key={`text-${tokenIndex}`}>{content}</Fragment>;
        }
        if (token.type === 'channel') {
          return (
            <button
              key={`channel-${token.channel}-${tokenIndex}`}
              type="button"
              onClick={() => props.onOpenChannel(token.channel)}
              className="cursor-pointer appearance-none border-0 bg-transparent p-0 align-baseline font-medium text-primary underline decoration-primary/80 decoration-2 underline-offset-2 transition-colors hover:decoration-primary hover:opacity-85"
            >
              {content}
            </button>
          );
        }
        if (isInlineImageHref(token.href)) {
          return null;
        }
        return (
          <a
            key={`link-${token.href}-${tokenIndex}`}
            href={token.href}
            target={token.external ? '_blank' : undefined}
            rel={token.external ? 'noreferrer' : undefined}
            className="font-medium text-primary underline decoration-primary/80 decoration-2 underline-offset-2 transition-colors hover:decoration-primary hover:opacity-85"
          >
            {content}
          </a>
        );
      })}
      {props.renderInlinePreviews === false ? null : <FormattedMessageInlinePreviews hrefs={content.inlineImageHrefs} />}
    </>
  );
});

const renderParts = (parts: MessageTextPart[], insideLink: boolean, tokenIndex: number) =>
  parts.map((part, partIndex) => {
    const style = resolveSpanStyle(part.style, insideLink);
    if (!style) {
      return part.text;
    }
    return (
      <span key={`part-${tokenIndex}-${partIndex}`} style={style}>
        {part.text}
      </span>
    );
  });

const resolveSpanStyle = (style: MessageTextPart['style'], insideLink: boolean): CSSProperties | null => {
  const colors = resolveColors(style);
  const decoration = [
    !insideLink && style.underline ? 'underline' : null,
    style.strikethrough ? 'line-through' : null,
  ].filter(Boolean);

  const spanStyle: CSSProperties = {
    color: colors.foregroundColor ?? undefined,
    backgroundColor: colors.backgroundColor ?? undefined,
    fontWeight: style.bold ? 700 : undefined,
    fontStyle: style.italic ? 'italic' : undefined,
    fontFamily: style.monospace ? 'var(--font-mono)' : undefined,
    textDecorationLine: decoration.length > 0 ? decoration.join(' ') : undefined,
  };

  return hasResolvedStyle(spanStyle) ? spanStyle : null;
};

const resolveColors = (style: MessageTextPart['style']) => {
  if (!style.reverse) {
    return {
      foregroundColor: style.foregroundColor,
      backgroundColor: style.backgroundColor,
    };
  }
  return {
    foregroundColor: style.backgroundColor ?? 'var(--background)',
    backgroundColor: style.foregroundColor ?? 'var(--foreground)',
  };
};

const hasResolvedStyle = (style: CSSProperties) =>
  style.color !== undefined ||
  style.backgroundColor !== undefined ||
  style.fontWeight !== undefined ||
  style.fontStyle !== undefined ||
  style.fontFamily !== undefined ||
  style.textDecorationLine !== undefined;

const inlineImageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp'];

const collectInlineImageHrefs = (tokens: ReturnType<typeof tokenizeFormattedMessage>) => {
  const hrefs: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    if (token.type !== 'link' || !isInlineImageHref(token.href) || seen.has(token.href)) {
      continue;
    }
    seen.add(token.href);
    hrefs.push(token.href);
  }
  return hrefs;
};

const isInlineImageHref = (href: string) => {
  try {
    const url = new URL(href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }
    const pathname = url.pathname.toLowerCase();
    return inlineImageExtensions.some((extension) => pathname.endsWith(extension));
  } catch {
    return false;
  }
};

const buildImageAltText = (href: string) => {
  try {
    const pathname = new URL(href).pathname;
    const name = pathname.split('/').at(-1)?.trim();
    return name ? `Inline image preview: ${name}` : 'Inline image preview';
  } catch {
    return 'Inline image preview';
  }
};
