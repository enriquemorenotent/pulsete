export type RawTextBlock =
  | { type: 'text'; text: string }
  | { type: 'code-fence'; language: string | null; text: string; raw: string };

const fencedCodePattern = /```([^\n`]*)\n?([\s\S]*?)```/g;

export const splitRawTextBlocks = (text: string): RawTextBlock[] => {
  const blocks: RawTextBlock[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(fencedCodePattern)) {
    const start = match.index ?? 0;
    blocks.push({ type: 'text', text: text.slice(lastIndex, start) });
    blocks.push({
      type: 'code-fence',
      language: normalizeFenceLanguage(match[1] ?? ''),
      text: match[2] ?? '',
      raw: match[0],
    });
    lastIndex = start + match[0].length;
  }

  blocks.push({ type: 'text', text: text.slice(lastIndex) });
  return blocks;
};

const normalizeFenceLanguage = (value: string) => {
  const text = value.trim();
  return text.length > 0 ? text : null;
};

export const trimFencePadding = (value: string) =>
  value.replace(/^\n+/, '').replace(/\n+$/, '');
