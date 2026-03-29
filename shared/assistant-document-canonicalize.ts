import {
  assistantSectionLabels,
  type AssistantSectionLabel,
} from './assistant-document-types.js';
import { splitRawTextBlocks } from './assistant-document-fences.js';

type RawSection = {
  label: AssistantSectionLabel | null;
  body: string;
};

const sectionLabelPattern = new RegExp(
  `\\b(${assistantSectionLabels.join('|')}):\\s*`,
  'g',
);

export const canonicalizeAssistantText = (text: string) => {
  if (!text.trim()) {
    return text;
  }

  const normalized = text.replace(/\r\n?/g, '\n');
  return splitRawTextBlocks(normalized)
    .map((block) =>
      block.type === 'text' ? canonicalizePlainTextBlock(block.text) : block.raw,
    )
    .join('');
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
      .replace(/\n{3,}/g, '\n\n'),
  )
    .map(canonicalizeSection)
    .join('\n\n');

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

  return sections.filter(
    (section) => section.label !== null || section.body.trim().length > 0,
  );
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
      if (previous && item[0] === previous[0] && isEvidenceDateHeading(item[0] ?? '')) {
        previous.push(...item.slice(1));
        continue;
      }
      mergedItems.push([...item]);
    }
    return mergedItems.length > 0
      ? `Evidence:\n${mergedItems
          .map(([firstLine, ...rest]) => [`- ${firstLine}`, ...rest].join('\n'))
          .join('\n')}`
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
  text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
