import type { tokenizeFormattedMessage } from './formatted-message.js';
import { buildImageAltText, isInlineImageHref } from './formatted-message-inline-images.js';

type FormattedMessageTokens = ReturnType<typeof tokenizeFormattedMessage>;

export type InlineMedia =
  | {
      kind: 'image';
      label?: string;
      originalHref: string;
      sourceHref: string;
    }
  | {
      kind: 'video';
      mimeType: 'video/mp4' | 'video/quicktime';
      originalHref: string;
      playback: 'looping-animation' | 'on-demand';
      sourceHref: string;
    };

type InlineMediaResolver = (url: URL, originalHref: string) => InlineMedia | null;

const inlineMediaResolvers: readonly InlineMediaResolver[] = [
  resolveTumblrGifv,
  resolveImgurGifv,
  resolveDirectVideo,
  resolveImage,
];

const directVideoFormats = [
  { extension: '.mp4', mimeType: 'video/mp4' },
  { extension: '.mov', mimeType: 'video/quicktime' },
] as const;

const inlineMediaLabelBuilders: Record<InlineMedia['kind'], (href: string) => string> = {
  image: buildImageAltText,
  video: buildVideoLabel,
};

export const collectInlineMedia = (tokens: FormattedMessageTokens) => {
  const media: InlineMedia[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    if (token.type !== 'link' || seen.has(token.href)) {
      continue;
    }
    const resolved = resolveInlineMediaHref(token.href);
    if (!resolved) {
      continue;
    }
    seen.add(token.href);
    media.push(resolved);
  }
  return media;
};

export const resolveInlineMediaHref = (href: string): InlineMedia | null => {
  try {
    const url = new URL(href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    for (const resolver of inlineMediaResolvers) {
      const media = resolver(url, href);
      if (media) {
        return media;
      }
    }
    return null;
  } catch {
    return null;
  }
};

export const isInlineMediaHref = (href: string) => resolveInlineMediaHref(href) !== null;

export const buildInlineMediaLabel = (media: InlineMedia) =>
  media.kind === 'image' && media.label
    ? `Inline image preview: ${media.label}`
    : inlineMediaLabelBuilders[media.kind](media.originalHref);

function resolveImgurGifv(url: URL, originalHref: string): InlineMedia | null {
  if (!isImgurHostname(url.hostname) || !/^\/[a-z0-9]+\.gifv$/i.test(url.pathname)) {
    return null;
  }
  const sourceUrl = new URL(url);
  sourceUrl.pathname = sourceUrl.pathname.replace(/\.gifv$/i, '.mp4');
  sourceUrl.hash = '';
  return {
    kind: 'video',
    mimeType: 'video/mp4',
    originalHref,
    playback: 'looping-animation',
    sourceHref: sourceUrl.href,
  };
}

function resolveTumblrGifv(url: URL, originalHref: string): InlineMedia | null {
  if (!isTumblrMediaHostname(url.hostname) || !url.pathname.toLowerCase().endsWith('.gifv')) {
    return null;
  }
  return {
    kind: 'image',
    originalHref,
    sourceHref: originalHref,
  };
}

function resolveDirectVideo(url: URL, originalHref: string): InlineMedia | null {
  const pathname = url.pathname.toLowerCase();
  const format = directVideoFormats.find(({ extension }) => pathname.endsWith(extension));
  if (!format) {
    return null;
  }
  return {
    kind: 'video',
    mimeType: format.mimeType,
    originalHref,
    playback: 'on-demand',
    sourceHref: originalHref,
  };
}

function resolveImage(_url: URL, originalHref: string): InlineMedia | null {
  return isInlineImageHref(originalHref)
    ? { kind: 'image', originalHref, sourceHref: originalHref }
    : null;
}

function isImgurHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === 'imgur.com' || normalized.endsWith('.imgur.com');
}

function isTumblrMediaHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === 'media.tumblr.com' || normalized.endsWith('.media.tumblr.com');
}

function buildVideoLabel(href: string) {
  try {
    const name = new URL(href).pathname.split('/').at(-1)?.trim();
    return name ? `Inline video preview: ${name}` : 'Inline video preview';
  } catch {
    return 'Inline video preview';
  }
}
