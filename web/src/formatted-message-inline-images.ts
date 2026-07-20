const inlineImageExtensions = ['.png', '.pnj', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp'];
const inlineImageFormats = new Set(inlineImageExtensions.map((extension) => extension.slice(1)));
const inlineImageFormatQueryKeys = new Set(['ext', 'fm', 'format']);

export const isInlineImageHref = (href: string) => {
  try {
    const url = new URL(href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }
    const pathname = url.pathname.toLowerCase();
    if (inlineImageExtensions.some((extension) => pathname.endsWith(extension))) {
      return true;
    }
    return hasInlineImageFormatQuery(url);
  } catch {
    return false;
  }
};

export const buildImageAltText = (href: string) => {
  try {
    const pathname = new URL(href).pathname;
    const name = pathname.split('/').at(-1)?.trim();
    return name ? `Inline image preview: ${name}` : 'Inline image preview';
  } catch {
    return 'Inline image preview';
  }
};

const hasInlineImageFormatQuery = (url: URL) => {
  for (const [key, value] of url.searchParams) {
    if (!inlineImageFormatQueryKeys.has(key.toLowerCase())) {
      continue;
    }
    if (inlineImageFormats.has(normalizeInlineImageFormat(value))) {
      return true;
    }
  }
  return false;
};

const normalizeInlineImageFormat = (value: string) => {
  const normalized = value.trim().toLowerCase().replace(/^image\//, '');
  return normalized.startsWith('.') ? normalized.slice(1) : normalized;
};
