import type { IrcTextStyle } from './irc-format-types.js';

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

export const applyNumericColor = (text: string, index: number, style: IrcTextStyle) => {
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

export const applyHexColor = (text: string, index: number, style: IrcTextStyle) => {
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
  return end === index
    ? null
    : { value: Number.parseInt(text.slice(index, end), 10), nextIndex: end };
};

const readNumericBackground = (text: string, index: number) => {
  if (text[index] !== ',') {
    return null;
  }
  const background = readNumericCode(text, index + 1);
  return background
    ? { value: background.value, nextIndex: background.nextIndex }
    : null;
};

const readHexCode = (text: string, index: number) => {
  const candidate = text.slice(index, index + 6);
  return /^[0-9A-Fa-f]{6}$/.test(candidate)
    ? { value: candidate, nextIndex: index + 6 }
    : null;
};

const readHexBackground = (text: string, index: number) => {
  if (text[index] !== ',') {
    return null;
  }
  const background = readHexCode(text, index + 1);
  return background
    ? { value: background.value, nextIndex: background.nextIndex }
    : null;
};

const isDigit = (character: string) => character >= '0' && character <= '9';

const resolveNumericColor = (index: number) => {
  if (index === 99) {
    return null;
  }
  return numericColorPalette[index] ?? null;
};
