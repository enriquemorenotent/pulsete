import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';

const nickTokenPattern = /[0-9A-Za-z\-\[\]\\`^{}_|]+/g;

const normalizeMentionCandidates = (candidates: readonly string[]) => {
  const normalized = new Set<string>();
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!trimmed) {
      continue;
    }
    normalized.add(normalizeIrcIdentifier(trimmed));
  }
  return normalized;
};

export const hasIrcMention = (body: string, candidates: readonly string[]) => {
  const normalizedCandidates = normalizeMentionCandidates(candidates);
  if (normalizedCandidates.size === 0) {
    return false;
  }
  for (const match of body.matchAll(nickTokenPattern)) {
    if (normalizedCandidates.has(normalizeIrcIdentifier(match[0]))) {
      return true;
    }
  }
  return false;
};
