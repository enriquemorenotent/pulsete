import { applyHexColor, applyNumericColor } from './irc-format-colors.js';

export type IrcTextStyle = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  monospace: boolean;
  reverse: boolean;
  foregroundColor: string | null;
  backgroundColor: string | null;
};

export type IrcFormattedRun = {
  text: string;
  style: IrcTextStyle;
};

const defaultStyle = (): IrcTextStyle => ({
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  monospace: false,
  reverse: false,
  foregroundColor: null,
  backgroundColor: null,
});

export const parseIrcFormatting = (text: string): IrcFormattedRun[] => {
  const runs: IrcFormattedRun[] = [];
  const style = defaultStyle();
  let buffer = '';
  let index = 0;

  const flush = () => {
    if (!buffer) {
      return;
    }
    runs.push({
      text: buffer,
      style: { ...style },
    });
    buffer = '';
  };

  while (index < text.length) {
    const character = text[index]!;

    if (character === '\u0002') {
      flush();
      style.bold = !style.bold;
      index += 1;
      continue;
    }
    if (character === '\u0003') {
      flush();
      index = applyNumericColor(text, index, style);
      continue;
    }
    if (character === '\u0004') {
      flush();
      index = applyHexColor(text, index, style);
      continue;
    }
    if (character === '\u000F') {
      flush();
      Object.assign(style, defaultStyle());
      index += 1;
      continue;
    }
    if (character === '\u0011') {
      flush();
      style.monospace = !style.monospace;
      index += 1;
      continue;
    }
    if (character === '\u0016') {
      flush();
      style.reverse = !style.reverse;
      index += 1;
      continue;
    }
    if (character === '\u001D') {
      flush();
      style.italic = !style.italic;
      index += 1;
      continue;
    }
    if (character === '\u001E') {
      flush();
      style.strikethrough = !style.strikethrough;
      index += 1;
      continue;
    }
    if (character === '\u001F') {
      flush();
      style.underline = !style.underline;
      index += 1;
      continue;
    }
    if (isDiscardedControlCode(character)) {
      index += 1;
      continue;
    }

    buffer += character;
    index += 1;
  }

  flush();
  return runs;
};

export const getVisibleIrcText = (text: string) => parseIrcFormatting(text).map((run) => run.text).join('');

export const escapeIrcTextForDebug = (text: string) =>
  Array.from(text, (character) => {
    const code = character.charCodeAt(0);
    if (character === '\n' || character === '\r' || character === '\t') {
      return character;
    }
    if (code < 32 || code === 127) {
      return `\\x${code.toString(16).toUpperCase().padStart(2, '0')}`;
    }
    return character;
  }).join('');

const isDiscardedControlCode = (character: string) =>
  character.charCodeAt(0) < 32 || character === '\u007F';
