import type { CommandPaletteEntrySpec } from './command-palette-types.js';

export const filterCommandPaletteEntries = <
  T extends Pick<
    CommandPaletteEntrySpec,
    'label' | 'subtitle' | 'keywords' | 'ranking' | 'section'
  >,
>(
  entries: readonly T[],
  query: string,
): T[] => {
  const normalizedQuery = normalizeCommandPaletteQuery(query);
  if (!normalizedQuery) {
    return [...entries];
  }
  return entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => getCommandPaletteSearchText(entry).includes(normalizedQuery))
    .sort((left, right) =>
      compareCommandPaletteSectionPriority(left.entry, right.entry)
      || compareCommandPaletteMatches(left.entry, right.entry, normalizedQuery)
      || left.index - right.index,
    )
    .map(({ entry }) => entry);
};

export const moveCommandPaletteActiveIndex = (
  currentIndex: number,
  itemCount: number,
  delta: -1 | 1,
) => {
  if (itemCount === 0) {
    return -1;
  }
  if (currentIndex < 0 || currentIndex >= itemCount) {
    return delta > 0 ? 0 : itemCount - 1;
  }
  return (currentIndex + delta + itemCount) % itemCount;
};

const normalizeCommandPaletteQuery = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

const getCommandPaletteSearchText = (
  entry: Pick<CommandPaletteEntrySpec, 'label' | 'subtitle' | 'keywords'>,
) =>
  normalizeCommandPaletteQuery(
    [entry.label, entry.subtitle, ...entry.keywords].filter(Boolean).join(' '),
  );

const compareCommandPaletteSectionPriority = (
  left: Pick<CommandPaletteEntrySpec, 'section'>,
  right: Pick<CommandPaletteEntrySpec, 'section'>,
) =>
  getCommandPaletteSectionPriority(left.section)
  - getCommandPaletteSectionPriority(right.section);

const getCommandPaletteSectionPriority = (
  section: CommandPaletteEntrySpec['section'],
) => {
  if (section === 'unread') {
    return 0;
  }
  if (section === 'buffers') {
    return 1;
  }
  return 2;
};

const compareCommandPaletteMatches = (
  left: Pick<CommandPaletteEntrySpec, 'label' | 'ranking'>,
  right: Pick<CommandPaletteEntrySpec, 'label' | 'ranking'>,
  query: string,
) =>
  compareMatchTuples(
    getCommandPaletteMatchTuple(left, query),
    getCommandPaletteMatchTuple(right, query),
  );

const getCommandPaletteMatchTuple = (
  entry: Pick<CommandPaletteEntrySpec, 'label' | 'ranking'>,
  query: string,
) => {
  const normalizedLabel = normalizeCommandPaletteQuery(entry.label);
  const normalizedBareLabel = stripCommandPaletteLabelPrefix(normalizedLabel);
  return [
    normalizedLabel === query || normalizedBareLabel === query ? 0 : 1,
    normalizedLabel.startsWith(query) || normalizedBareLabel.startsWith(query) ? 0 : 1,
    normalizedLabel.includes(query) || normalizedBareLabel.includes(query) ? 0 : 1,
    entry.ranking.selected ? 0 : 1,
    entry.ranking.currentNetwork ? 0 : 1,
    entry.ranking.priorityUnread > 0 ? 0 : 1,
    entry.ranking.unread > 0 ? 0 : 1,
    -entry.ranking.priorityUnread,
    -entry.ranking.unread,
  ] as const;
};

const compareMatchTuples = (
  left: readonly number[],
  right: readonly number[],
) => {
  for (let index = 0; index < left.length; index += 1) {
    const difference = left[index]! - right[index]!;
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
};

const stripCommandPaletteLabelPrefix = (value: string) =>
  value.replace(/^[#&+!]+/, '');
