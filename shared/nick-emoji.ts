type SegmenterLike = {
  segment(value: string): Iterable<{ segment: string }>;
};

const emojiLikePattern =
  /(\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Regional_Indicator}|[#*0-9]\uFE0F?\u20E3|\p{Emoji}\uFE0F)/u;

export const normalizeNickEmojiTag = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
};

export const isSingleNickEmojiTag = (value: string) => {
  const normalized = normalizeNickEmojiTag(value);
  if (!normalized) {
    return false;
  }
  const segments = splitGraphemes(normalized);
  return segments.length === 1 && emojiLikePattern.test(segments[0]!);
};

const splitGraphemes = (value: string) => {
  const Segmenter = (Intl as typeof Intl & {
    Segmenter?: new (locale: string | undefined, options: { granularity: 'grapheme' }) => SegmenterLike;
  }).Segmenter;
  if (!Segmenter) {
    return Array.from(value);
  }
  return Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(value), (entry) => entry.segment);
};
