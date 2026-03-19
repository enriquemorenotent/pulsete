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

const numericColorPalette = [
  '#FFFFFF',
  '#000000',
  '#00007F',
  '#009300',
  '#FF0000',
  '#7F0000',
  '#9C009C',
  '#FC7F00',
  '#FFFF00',
  '#00FC00',
  '#009393',
  '#00FFFF',
  '#0000FC',
  '#FF00FF',
  '#7F7F7F',
  '#D2D2D2',
  '#470000',
  '#472100',
  '#474700',
  '#324700',
  '#004700',
  '#00472C',
  '#004747',
  '#002747',
  '#000047',
  '#2E0047',
  '#470047',
  '#47002A',
  '#740000',
  '#743A00',
  '#747400',
  '#517400',
  '#007400',
  '#007449',
  '#007474',
  '#004074',
  '#000074',
  '#4B0074',
  '#740074',
  '#740045',
  '#B50000',
  '#B56300',
  '#B5B500',
  '#7DB500',
  '#00B500',
  '#00B571',
  '#00B5B5',
  '#0063B5',
  '#0000B5',
  '#7500B5',
  '#B500B5',
  '#B5006B',
  '#FF0000',
  '#FF8C00',
  '#FFFF00',
  '#B2FF00',
  '#00FF00',
  '#00FFA0',
  '#00FFFF',
  '#008CFF',
  '#0000FF',
  '#A500FF',
  '#FF00FF',
  '#FF0098',
  '#FF5959',
  '#FFB459',
  '#FFFF71',
  '#CFFF60',
  '#6FFF6F',
  '#65FFC9',
  '#6DFFFF',
  '#59B4FF',
  '#5959FF',
  '#C459FF',
  '#FF66FF',
  '#FF59BC',
  '#FF9C9C',
  '#FFD39C',
  '#FFFF9C',
  '#E2FF9C',
  '#9CFF9C',
  '#9CFFDB',
  '#9CFFFF',
  '#9CD3FF',
  '#9C9CFF',
  '#DC9CFF',
  '#FF9CFF',
  '#FF94D3',
  '#000000',
  '#131313',
  '#282828',
  '#363636',
  '#4D4D4D',
  '#656565',
  '#818181',
  '#9F9F9F',
  '#BCBCBC',
  '#E2E2E2',
  '#FFFFFF',
] as const;

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

const applyNumericColor = (text: string, index: number, style: IrcTextStyle) => {
  const foreground = readNumericCode(text, index + 1);
  if (!foreground) {
    if (text[index + 1] !== ',') {
      style.foregroundColor = null;
      style.backgroundColor = null;
    }
    return index + 1;
  }

  style.foregroundColor = resolveNumericColor(foreground.value);
  let nextIndex = foreground.nextIndex;
  const background = readNumericBackground(text, nextIndex);
  if (background) {
    style.backgroundColor = resolveNumericColor(background.value);
    nextIndex = background.nextIndex;
  }
  return nextIndex;
};

const applyHexColor = (text: string, index: number, style: IrcTextStyle) => {
  const foreground = readHexCode(text, index + 1);
  if (!foreground) {
    style.foregroundColor = null;
    style.backgroundColor = null;
    return index + 1;
  }

  style.foregroundColor = `#${foreground.value.toUpperCase()}`;
  let nextIndex = foreground.nextIndex;
  const background = readHexBackground(text, nextIndex);
  if (background) {
    style.backgroundColor = `#${background.value.toUpperCase()}`;
    nextIndex = background.nextIndex;
  }
  return nextIndex;
};

const readNumericCode = (text: string, index: number) => {
  let end = index;
  while (end < text.length && end - index < 2 && isDigit(text[end]!)) {
    end += 1;
  }
  if (end === index) {
    return null;
  }
  return {
    value: Number.parseInt(text.slice(index, end), 10),
    nextIndex: end,
  };
};

const readNumericBackground = (text: string, index: number) => {
  if (text[index] !== ',') {
    return null;
  }
  const background = readNumericCode(text, index + 1);
  if (!background) {
    return null;
  }
  return {
    value: background.value,
    nextIndex: background.nextIndex,
  };
};

const readHexCode = (text: string, index: number) => {
  const candidate = text.slice(index, index + 6);
  if (!/^[0-9A-Fa-f]{6}$/.test(candidate)) {
    return null;
  }
  return {
    value: candidate,
    nextIndex: index + 6,
  };
};

const readHexBackground = (text: string, index: number) => {
  if (text[index] !== ',') {
    return null;
  }
  const background = readHexCode(text, index + 1);
  if (!background) {
    return null;
  }
  return {
    value: background.value,
    nextIndex: background.nextIndex,
  };
};

const isDigit = (character: string) => character >= '0' && character <= '9';

const resolveNumericColor = (index: number) => {
  if (index === 99) {
    return null;
  }
  return numericColorPalette[index] ?? null;
};
