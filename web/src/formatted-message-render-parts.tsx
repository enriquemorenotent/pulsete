import type { CSSProperties } from 'react';
import type { MessageTextPart } from './formatted-message.js';

export const renderFormattedMessageParts = (
  parts: MessageTextPart[],
  insideLink: boolean,
  tokenIndex: number,
) => parts.map((part, partIndex) => {
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
