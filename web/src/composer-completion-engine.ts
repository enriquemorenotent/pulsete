import { normalizeIrcIdentifier } from '../../shared/irc-identifiers.js';

export type ComposerCompletionDirection = 'forward' | 'backward';

export type ComposerCompletionSession = {
  candidatesKey: string;
  contextKey: string;
  draft: string;
  fragment: string;
  matchIndex: number;
  matches: string[];
  replacementEnd: number;
  replacementStart: number;
  selectionEnd: number;
  selectionStart: number;
};

type ComposerCompletionRequest = {
  candidates: string[];
  commandCandidates: string[];
  contextKey: string;
  direction: ComposerCompletionDirection;
  draft: string;
  selectionEnd: number | null;
  selectionStart: number | null;
  session: ComposerCompletionSession | null;
};

export type ComposerCompletionResult = {
  draft: string;
  selectionEnd: number;
  selectionStart: number;
  session: ComposerCompletionSession;
};

const whitespacePattern = /\s/;

export const getComposerCompletionResult = (
  request: ComposerCompletionRequest,
): ComposerCompletionResult | null => {
  const { selectionStart, selectionEnd } = request;
  if (selectionStart === null || selectionEnd === null || selectionStart !== selectionEnd) {
    return null;
  }

  const candidatesKey = buildComposerCompletionCandidatesKey(request.commandCandidates, request.candidates);
  if (isContinuationSession(request, candidatesKey)) {
    return applyComposerCompletionMatch({
      draft: request.draft,
      direction: request.direction,
      matchIndex: request.session.matchIndex,
      matches: request.session.matches,
      replacementEnd: request.session.replacementEnd,
      replacementStart: request.session.replacementStart,
      selectionEnd: request.session.selectionEnd,
      selectionStart: request.session.selectionStart,
      contextKey: request.contextKey,
      candidatesKey,
      fragment: request.session.fragment,
    });
  }

  const target = getComposerCompletionTarget(request.draft, selectionStart, selectionEnd);
  if (!target) {
    return null;
  }

  const matches = getMatchingComposerCandidates(
    getComposerCompletionCandidatesForTarget(request, target),
    target.fragment,
  );
  if (matches.length === 0) {
    return null;
  }

  return applyComposerCompletionMatch({
    draft: request.draft,
    direction: request.direction,
    matchIndex: request.direction === 'forward' ? -1 : 0,
    matches,
    replacementEnd: target.tokenEnd,
    replacementStart: target.tokenStart,
    selectionEnd,
    selectionStart,
    contextKey: request.contextKey,
    candidatesKey,
    fragment: target.fragment,
  });
};

const buildComposerCompletionCandidatesKey = (commandCandidates: string[], candidates: string[]) =>
  [
    commandCandidates.map((candidate) => normalizeIrcIdentifier(candidate)).join('\u001f'),
    candidates.map((candidate) => normalizeIrcIdentifier(candidate)).join('\u001f'),
  ].join('\u001e');

const isContinuationSession = (
  request: ComposerCompletionRequest,
  candidatesKey: string,
): request is ComposerCompletionRequest & { session: ComposerCompletionSession } => (
  request.session !== null
  && request.session.contextKey === request.contextKey
  && request.session.candidatesKey === candidatesKey
  && request.session.draft === request.draft
  && request.session.selectionStart === request.selectionStart
  && request.session.selectionEnd === request.selectionEnd
);

const getComposerCompletionTarget = (
  draft: string,
  selectionStart: number,
  selectionEnd: number,
) => {
  if (selectionStart !== selectionEnd) {
    return null;
  }

  let tokenStart = selectionStart;
  while (tokenStart > 0 && !whitespacePattern.test(draft[tokenStart - 1] ?? '')) {
    tokenStart -= 1;
  }

  let tokenEnd = selectionEnd;
  while (tokenEnd < draft.length && !whitespacePattern.test(draft[tokenEnd] ?? '')) {
    tokenEnd += 1;
  }

  const fragment = draft.slice(tokenStart, selectionStart);
  if (!fragment) {
    return null;
  }

  return {
    fragment,
    tokenEnd,
    tokenStart,
  };
};

const getComposerCompletionCandidatesForTarget = (
  request: Pick<ComposerCompletionRequest, 'candidates' | 'commandCandidates' | 'draft'>,
  target: { fragment: string; tokenStart: number },
) => {
  if (target.fragment.startsWith('/') && request.draft.slice(0, target.tokenStart).trim() === '') {
    return request.commandCandidates;
  }
  return request.candidates;
};

const getMatchingComposerCandidates = (candidates: string[], fragment: string) => {
  const normalizedFragment = normalizeIrcIdentifier(fragment);
  return candidates.filter((candidate) =>
    normalizeIrcIdentifier(candidate).startsWith(normalizedFragment),
  );
};

const applyComposerCompletionMatch = (input: {
  candidatesKey: string;
  contextKey: string;
  direction: ComposerCompletionDirection;
  draft: string;
  fragment: string;
  matchIndex: number;
  matches: string[];
  replacementEnd: number;
  replacementStart: number;
  selectionEnd: number;
  selectionStart: number;
}): ComposerCompletionResult => {
  const nextIndex =
    input.direction === 'forward'
      ? (input.matchIndex + 1) % input.matches.length
      : (input.matchIndex - 1 + input.matches.length) % input.matches.length;
  const nextCandidate = input.matches[nextIndex] ?? '';
  const draft =
    input.draft.slice(0, input.replacementStart)
    + nextCandidate
    + input.draft.slice(input.replacementEnd);
  const selectionStart = input.replacementStart + nextCandidate.length;

  return {
    draft,
    selectionStart,
    selectionEnd: selectionStart,
    session: {
      candidatesKey: input.candidatesKey,
      contextKey: input.contextKey,
      draft,
      fragment: input.fragment,
      matchIndex: nextIndex,
      matches: input.matches,
      replacementEnd: selectionStart,
      replacementStart: input.replacementStart,
      selectionEnd: selectionStart,
      selectionStart,
    },
  };
};
