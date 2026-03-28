import type {
  AssistantAskEvidenceGroup,
  AssistantAskEvidenceLine,
  ChatMessage,
} from '../shared/protocol.js';
import { formatTimestamp, matchesTerm } from './assistant-history-context.js';
import { evidenceNeighborMaxGapMs } from './assistant-ask-retrieval-constants.js';

export const collectExactMatchedEvidenceMessages = (
  windows: Array<{ messages: ChatMessage[] }>,
  matchedMessageIds: string[],
  limit: number,
) => {
  const matchedIds = new Set(matchedMessageIds);
  const selected: ChatMessage[] = [];
  const seen = new Set<string>();
  for (const window of windows) {
    for (const message of window.messages) {
      if (matchedIds.has(message.id) && !seen.has(message.id)) {
        seen.add(message.id);
        selected.push(message);
      }
      if (selected.length >= limit) {
        return selected;
      }
    }
  }
  return selected;
};

export const collectRelevantEvidenceMessages = (
  windows: Array<{ messages: ChatMessage[] }>,
  matchedMessageIds: string[],
  searchTerms: string[],
  limit: number,
) => {
  const selected: ChatMessage[] = [];
  const seenMessageIds = new Set<string>();
  const matchedIds = new Set(matchedMessageIds);
  for (const window of windows) {
    for (const message of selectRelevantEvidenceMessages(window.messages, matchedIds, searchTerms)) {
      if (!seenMessageIds.has(message.id)) {
        seenMessageIds.add(message.id);
        selected.push(message);
      }
      if (selected.length >= limit) {
        return selected;
      }
    }
  }
  return selected;
};

export const buildEvidenceGroups = (messages: ChatMessage[]): AssistantAskEvidenceGroup[] =>
  collapseEvidenceGroups(sortMessagesByTimestamp(messages).map((message) => ({
    heading: formatEvidenceHeading(message.ts),
    lines: [formatEvidenceLine(message)],
  })));

export const renderEvidenceGroupsContext = (groups: AssistantAskEvidenceGroup[]) => {
  if (groups.length === 0) {
    return 'Excerpt:\n(none)';
  }
  return ['Excerpt:', ...groups.flatMap((group) => [
    group.heading,
    ...group.lines.map((line) => formatEvidenceContextLine(line)),
  ])].join('\n');
};

const selectRelevantEvidenceMessages = (
  messages: ChatMessage[],
  matchedMessageIds: Set<string>,
  searchTerms: string[],
) => {
  const relevantIndexes = new Set<number>();
  const matchingIndexes = messages
    .map((message, index) => (
      matchedMessageIds.has(message.id) || searchTerms.some((term) => matchesTerm(message, term))
        ? index
        : -1
    ))
    .filter((index) => index >= 0);
  for (const index of matchingIndexes) {
    relevantIndexes.add(index);
    if (index > 0 && canIncludeEvidenceNeighbor(messages[index]!, messages[index - 1]!)) {
      relevantIndexes.add(index - 1);
    }
    if (index < messages.length - 1 && canIncludeEvidenceNeighbor(messages[index]!, messages[index + 1]!)) {
      relevantIndexes.add(index + 1);
    }
  }
  return relevantIndexes.size === 0
    ? messages.slice(0, Math.min(messages.length, 3))
    : [...relevantIndexes].sort((left, right) => left - right).map((index) => messages[index]!).filter(Boolean);
};

const collapseEvidenceGroups = (groups: AssistantAskEvidenceGroup[]) => {
  const merged: AssistantAskEvidenceGroup[] = [];
  const groupsByHeading = new Map<string, AssistantAskEvidenceGroup>();
  for (const group of groups) {
    const heading = group.heading.trim();
    const lines = group.lines.filter((line) => line.body.trim());
    if (!heading || lines.length === 0) {
      continue;
    }
    const existing = groupsByHeading.get(heading);
    if (existing) {
      for (const line of lines) {
        if (!existing.lines.some((candidate) => candidate.messageId === line.messageId)) {
          existing.lines.push(line);
        }
      }
      continue;
    }
    const nextGroup = { heading, lines: [...lines] };
    groupsByHeading.set(heading, nextGroup);
    merged.push(nextGroup);
  }
  return merged;
};

const sortMessagesByTimestamp = (messages: ChatMessage[]) =>
  [...messages].sort((left, right) => left.ts - right.ts || left.id.localeCompare(right.id));

const canIncludeEvidenceNeighbor = (anchor: ChatMessage, candidate: ChatMessage) =>
  formatEvidenceHeading(anchor.ts) === formatEvidenceHeading(candidate.ts)
  && Math.abs(anchor.ts - candidate.ts) <= evidenceNeighborMaxGapMs;

const splitTimestamp = (ts: number) => {
  const stamp = formatTimestamp(ts);
  return [stamp.slice(0, 10), stamp.slice(11)] as const;
};

const formatEvidenceHeading = (ts: number) => splitTimestamp(ts)[0];

const formatEvidenceLine = (message: ChatMessage): AssistantAskEvidenceLine => ({
  messageId: message.id,
  speakerRole: message.speakerRole,
  speakerNick: message.speakerNick ?? message.nick,
  attributionConfidence: message.attributionConfidence,
  body: message.body,
  kind: message.kind,
});

const formatEvidenceContextLine = (line: AssistantAskEvidenceLine) => {
  if (line.kind === 'join' || line.kind === 'part' || line.kind === 'quit' || line.kind === 'system') {
    return `[${line.kind}] ${line.body}`;
  }
  const speaker = line.speakerRole === 'self' && line.attributionConfidence === 'high'
    ? 'You'
    : line.speakerNick ?? 'unknown';
  return line.kind === 'action' ? `* ${speaker} ${line.body}` : `${speaker}: ${line.body}`;
};
