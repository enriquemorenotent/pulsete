type HslColor = {
  hue: number;
  lightness: number;
  saturation: number;
};

type RgbColor = {
  blue: number;
  green: number;
  red: number;
};

const hexColorPattern = /^#([0-9A-Fa-f]{6})$/;

export const resolveIrcForegroundColor = (color: string | null) => {
  const hsl = parseHexColor(color);
  if (!hsl) {
    return color;
  }
  const saturation = resolveReadableSaturation(hsl.saturation);
  const lightness = clamp(
    hsl.lightness < 35 ? 62 : hsl.lightness < 58 ? 66 : hsl.lightness,
    58,
    80,
  );
  return formatHsl({ hue: hsl.hue, saturation, lightness });
};

export const resolveIrcBackgroundColor = (
  color: string | null,
  alpha = 0.18,
) => {
  const hsl = parseHexColor(color);
  if (!hsl) {
    return color;
  }
  const saturation = hsl.saturation < 12 ? 0 : Math.min(hsl.saturation, 36);
  const lightness = clamp(
    hsl.lightness < 35 ? 48 : hsl.lightness > 70 ? 62 : 54,
    46,
    62,
  );
  return formatHsl({ hue: hsl.hue, saturation, lightness }, alpha);
};

export const defaultReverseForegroundColor = 'var(--transcript-message)';
export const defaultReverseBackgroundColor = 'rgba(255, 255, 255, 0.12)';

const parseHexColor = (color: string | null): HslColor | null => {
  const match = color?.match(hexColorPattern);
  if (!match) {
    return null;
  }
  return rgbToHsl({
    red: Number.parseInt(match[1]!.slice(0, 2), 16),
    green: Number.parseInt(match[1]!.slice(2, 4), 16),
    blue: Number.parseInt(match[1]!.slice(4, 6), 16),
  });
};

const rgbToHsl = (color: RgbColor): HslColor => {
  const red = color.red / 255;
  const green = color.green / 255;
  const blue = color.blue / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;

  if (delta === 0) {
    return {
      hue: 0,
      saturation: 0,
      lightness: Math.round(lightness * 100),
    };
  }

  const saturation = delta / (1 - Math.abs((2 * lightness) - 1));
  let hue = 0;
  if (max === red) {
    hue = ((green - blue) / delta) % 6;
  } else if (max === green) {
    hue = ((blue - red) / delta) + 2;
  } else {
    hue = ((red - green) / delta) + 4;
  }

  return {
    hue: Math.round(hue * 60 + (hue < 0 ? 360 : 0)),
    saturation: Math.round(saturation * 100),
    lightness: Math.round(lightness * 100),
  };
};

const resolveReadableSaturation = (saturation: number) => {
  if (saturation < 12) {
    return 0;
  }
  return clamp(saturation, 20, 58);
};

const formatHsl = (color: HslColor, alpha?: number) =>
  alpha === undefined
    ? `hsl(${color.hue} ${color.saturation}% ${color.lightness}%)`
    : `hsl(${color.hue} ${color.saturation}% ${color.lightness}% / ${alpha})`;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
