export type AssistantSectionLabel = 'Answer' | 'Evidence' | 'Limits';

export type AssistantDocument = {
  sections: AssistantDocumentSection[];
};

export type AssistantDocumentSection = {
  label: AssistantSectionLabel | null;
  blocks: AssistantDocumentBlock[];
};

export type AssistantDocumentBlock =
  | {
      type: 'paragraph';
      lines: string[];
    }
  | {
      type: 'bullet-list';
      items: { lines: string[] }[];
    }
  | {
      type: 'code-fence';
      language: string | null;
      text: string;
    };

type RawTextBlock =
  | { type: 'text'; text: string }
  | { type: 'code-fence'; language: string | null; text: string; raw: string };

type RawSection = {
  label: AssistantSectionLabel | null;
  body: string;
};

const fencedCodePattern = /```([^\n`]*)\n?([\s\S]*?)```/g;
const sectionLabels = ['Answer', 'Evidence', 'Limits'] as const;
const sectionLabelPattern = new RegExp(`\\b(${sectionLabels.join('|')}):\\s*`, 'g');

export const canonicalizeAssistantText = (text: string) => {
  if (!text.trim()) {
    return text;
  }

  const normalized = text.replace(/\r\n?/g, '\n');
  return splitRawTextBlocks(normalized).map((block) => (
    block.type === 'text'
      ? canonicalizePlainTextBlock(block.text)
      : block.raw
  )).join('');
};

export const parseAssistantDocument = (text: string): AssistantDocument => {
  const sections: AssistantDocumentSection[] = [];
  let currentSection = createSection(null);

  const pushCurrentSection = () => {
    if (currentSection.blocks.length === 0 && currentSection.label === null) {
      return;
    }
    sections.push(currentSection);
  };

  for (const block of splitRawTextBlocks(text)) {
    if (block.type === 'code-fence') {
      currentSection.blocks.push({
        type: 'code-fence',
        language: block.language,
        text: trimFencePadding(block.text),
      });
      continue;
    }

    const parser = createTextSectionParser({
      onSectionLabel: (label) => {
        pushCurrentSection();
        currentSection = createSection(label);
      },
      onBlock: (nextBlock) => {
        currentSection.blocks.push(nextBlock);
      },
    });
    parser.write(block.text);
    parser.finish();
  }

  pushCurrentSection();
  return { sections };
};

const createSection = (label: AssistantSectionLabel | null): AssistantDocumentSection => ({
  label,
  blocks: [],
});

const splitRawTextBlocks = (text: string): RawTextBlock[] => {
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

const canonicalizePlainTextBlock = (text: string) => {
  const { leadingBreaks, trailingBreaks, core } = splitOuterLineBreaks(text);
  if (!core.trim()) {
    return collapseBlankLineRuns(text);
  }

  const normalizedCore = splitLabeledSections(
    core
      .replace(/[ \t]+\n/g, '\n')
      .replace(/([.!?])([A-Z])/g, '$1 $2')
      .replace(/([.!?])([“"'])([A-Z])/g, '$1 $2$3')
      .replace(/([”’])([A-Z])/g, '$1 $2')
      .replace(/\n{3,}/g, '\n\n')
  ).map(canonicalizeSection).join('\n\n');

  return leadingBreaks + normalizedCore + trailingBreaks;
};

const splitOuterLineBreaks = (text: string) => {
  const leading = text.match(/^\n+/)?.[0] ?? '';
  const trailing = text.match(/\n+$/)?.[0] ?? '';
  const coreEnd = trailing.length > 0 ? text.length - trailing.length : text.length;
  return {
    leadingBreaks: leading.length > 0 ? '\n'.repeat(Math.min(2, leading.length)) : '',
    trailingBreaks: trailing.length > 0 ? '\n'.repeat(Math.min(2, trailing.length)) : '',
    core: text.slice(leading.length, coreEnd),
  };
};

const splitLabeledSections = (text: string): RawSection[] => {
  const sections: RawSection[] = [];
  let lastIndex = 0;
  let lastLabel: AssistantSectionLabel | null = null;

  for (const match of text.matchAll(sectionLabelPattern)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      sections.push({
        label: lastLabel,
        body: text.slice(lastIndex, start),
      });
    }
    lastLabel = (match[1] ?? null) as AssistantSectionLabel | null;
    lastIndex = start + match[0].length;
  }

  sections.push({
    label: lastLabel,
    body: text.slice(lastIndex),
  });

  return sections.filter((section) => section.label !== null || section.body.trim().length > 0);
};

const canonicalizeSection = (section: RawSection) => {
  const body = normalizeInlineBulletBoundaries(section.body).trim();
  if (section.label === 'Evidence') {
    const items: string[][] = [];
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }
      if (line.startsWith('- ')) {
        const bulletParts = line
          .slice(2)
          .split(/\s+-\s+/)
          .map((part) => part.trim())
          .filter(Boolean);
        if (bulletParts.length === 0) {
          continue;
        }
        for (const part of bulletParts) {
          items.push([part]);
        }
        continue;
      }
      if (items.length === 0) {
        items.push([line]);
        continue;
      }
      items[items.length - 1]!.push(line);
    }
    const mergedItems: string[][] = [];
    for (const item of items) {
      const previous = mergedItems.at(-1);
      if (
        previous
        && item[0] === previous[0]
        && isEvidenceDateHeading(item[0] ?? '')
      ) {
        previous.push(...item.slice(1));
        continue;
      }
      mergedItems.push([...item]);
    }
    return mergedItems.length > 0
      ? `Evidence:\n${mergedItems.map(([firstLine, ...rest]) => [`- ${firstLine}`, ...rest].join('\n')).join('\n')}`
      : 'Evidence:';
  }

  if (section.label) {
    return body.length > 0 ? `${section.label}:\n${body}` : `${section.label}:`;
  }
  return body;
};

const normalizeInlineBulletBoundaries = (text: string) =>
  text
    .replace(/([^\n])\s+-\s+(?=(?:\d{4}-\d{2}-\d{2}|["“'A-Z]))/g, '$1\n- ')
    .replace(/\n{3,}/g, '\n\n');

const isEvidenceDateHeading = (line: string) =>
  /^\d{4}-\d{2}-\d{2}(?:\s*(?:\||$).*)?$/.test(line.trim());

const collapseBlankLineRuns = (text: string) =>
  text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

const createTextSectionParser = (params: {
  onSectionLabel: (label: AssistantSectionLabel) => void;
  onBlock: (block: AssistantDocumentBlock) => void;
}) => {
  let paragraphLines: string[] = [];
  let bulletItems: Array<{ lines: string[] }> = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }
    params.onBlock({ type: 'paragraph', lines: paragraphLines });
    paragraphLines = [];
  };

  const flushBulletList = () => {
    if (bulletItems.length === 0) {
      return;
    }
    params.onBlock({ type: 'bullet-list', items: bulletItems });
    bulletItems = [];
  };

  const flushAll = () => {
    flushParagraph();
    flushBulletList();
  };

  return {
    write(text: string) {
      for (const rawLine of text.split('\n')) {
        const line = rawLine.trimEnd();
        const label = parseSectionLabel(line);
        if (label) {
          flushAll();
          params.onSectionLabel(label);
          continue;
        }
        if (!line.trim()) {
          flushAll();
          continue;
        }
        if (line.startsWith('- ')) {
          flushParagraph();
          bulletItems.push({ lines: [line.slice(2)] });
          continue;
        }
        if (bulletItems.length > 0) {
          bulletItems[bulletItems.length - 1]!.lines.push(line.trim());
          continue;
        }
        paragraphLines.push(line);
      }
    },
    finish() {
      flushAll();
    },
  };
};

const parseSectionLabel = (line: string): AssistantSectionLabel | null => {
  const value = line.trim();
  return sectionLabels.includes(value.slice(0, -1) as AssistantSectionLabel) && value.endsWith(':')
    ? value.slice(0, -1) as AssistantSectionLabel
    : null;
};

const normalizeFenceLanguage = (value: string) => {
  const text = value.trim();
  return text.length > 0 ? text : null;
};

const trimFencePadding = (value: string) => value.replace(/^\n+/, '').replace(/\n+$/, '');
