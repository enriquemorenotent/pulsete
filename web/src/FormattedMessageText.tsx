import { Fragment, type CSSProperties } from 'react';
import { tokenizeFormattedMessage, tokenizeStrippedMessage, type MessageTextPart } from './formatted-message.js';
import { escapeIrcTextForDebug } from './irc-format.js';
import type { MessageDisplayMode } from './message-display-mode.js';

type FormattedMessageTextProps = {
  text: string;
  onOpenChannel: (channel: string) => void;
  mode?: MessageDisplayMode;
};

export function FormattedMessageText(props: FormattedMessageTextProps) {
  if (props.mode === 'raw') {
    return <span className="font-mono">{escapeIrcTextForDebug(props.text)}</span>;
  }

  const tokens = props.mode === 'stripped' ? tokenizeStrippedMessage(props.text) : tokenizeFormattedMessage(props.text);

  return tokens.map((token, tokenIndex) => {
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
  });
}

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
