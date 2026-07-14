import {
  buildChatTranscriptModel,
  type BuildChatTranscriptModelInput,
  type ChatTranscriptModel,
} from './model.js';
import {
  appendChatTranscriptMessages,
  trimChatTranscriptModel,
} from './model-update.js';
import { getLocalDayKey } from './timestamp-groups.js';

export type ChatTranscriptDerivationStrategy =
  | 'append'
  | 'full'
  | 'sliding-window'
  | 'unchanged';

export type ChatTranscriptDerivation = {
  input: BuildChatTranscriptModelInput;
  model: ChatTranscriptModel;
  referenceDayKey: string;
  strategy: ChatTranscriptDerivationStrategy;
};

type MessageTransition =
  | { kind: 'append'; overlapLength: number }
  | { droppedCount: number; kind: 'sliding-window'; overlapLength: number }
  | { kind: 'unchanged'; overlapLength: number };

export const deriveChatTranscriptModel = (
  input: BuildChatTranscriptModelInput,
  previous: ChatTranscriptDerivation | null,
  now = Date.now(),
): ChatTranscriptDerivation => {
  const referenceDayKey = getLocalDayKey(now);
  if (
    !previous
    || previous.referenceDayKey !== referenceDayKey
    || !hasStableConfiguration(previous.input, input)
  ) {
    return buildFullDerivation(input, referenceDayKey, now);
  }
  const transition = resolveMessageTransition(
    previous.input.messages,
    input.messages,
  );
  if (!transition) {
    return buildFullDerivation(input, referenceDayKey, now);
  }
  if (
    transition.kind === 'unchanged'
    && previous.input.firstUnreadDividerIndex === input.firstUnreadDividerIndex
  ) {
    return { input, model: previous.model, referenceDayKey, strategy: 'unchanged' };
  }
  if (transition.kind === 'append') {
    if (!canAppendUnreadDivider(previous.input, input, transition.overlapLength)) {
      return buildFullDerivation(input, referenceDayKey, now);
    }
    return {
      input,
      model: appendChatTranscriptMessages(
        previous.model,
        input,
        transition.overlapLength,
        false,
        now,
      ),
      referenceDayKey,
      strategy: 'append',
    };
  }
  if (transition.kind === 'sliding-window') {
    if (!canSlideUnreadDivider(previous.input, input, transition)) {
      return buildFullDerivation(input, referenceDayKey, now);
    }
    const firstRetainedMessage = input.messages[0];
    const trimmedModel = firstRetainedMessage
      ? trimChatTranscriptModel(previous.model, firstRetainedMessage)
      : null;
    if (!trimmedModel) {
      return buildFullDerivation(input, referenceDayKey, now);
    }
    return {
      input,
      model: appendChatTranscriptMessages(
        trimmedModel,
        input,
        transition.overlapLength,
        true,
        now,
      ),
      referenceDayKey,
      strategy: 'sliding-window',
    };
  }
  return buildFullDerivation(input, referenceDayKey, now);
};

const buildFullDerivation = (
  input: BuildChatTranscriptModelInput,
  referenceDayKey: string,
  now: number,
): ChatTranscriptDerivation => ({
  input,
  model: buildChatTranscriptModel(input, now),
  referenceDayKey,
  strategy: 'full',
});

const hasStableConfiguration = (
  previous: BuildChatTranscriptModelInput,
  next: BuildChatTranscriptModelInput,
) =>
  previous.listKind === next.listKind
  && previous.mutedNicks === next.mutedNicks
  && previous.unreadDividerKey === next.unreadDividerKey;

const resolveMessageTransition = (
  previous: BuildChatTranscriptModelInput['messages'],
  next: BuildChatTranscriptModelInput['messages'],
): MessageTransition | null => {
  if (
    next.length >= previous.length
    && matchesRange(previous, 0, next, 0, previous.length)
  ) {
    return {
      kind: next.length === previous.length ? 'unchanged' : 'append',
      overlapLength: previous.length,
    };
  }
  if (previous.length === 0 || next.length === 0) {
    return null;
  }
  const previousStart = previous.indexOf(next[0]);
  if (previousStart <= 0) {
    return null;
  }
  const overlapLength = previous.length - previousStart;
  if (
    next.length < overlapLength
    || !matchesRange(previous, previousStart, next, 0, overlapLength)
  ) {
    return null;
  }
  return {
    droppedCount: previousStart,
    kind: 'sliding-window',
    overlapLength,
  };
};

const matchesRange = (
  previous: BuildChatTranscriptModelInput['messages'],
  previousStart: number,
  next: BuildChatTranscriptModelInput['messages'],
  nextStart: number,
  length: number,
) => {
  for (let offset = 0; offset < length; offset += 1) {
    if (previous[previousStart + offset] !== next[nextStart + offset]) {
      return false;
    }
  }
  return true;
};

const canAppendUnreadDivider = (
  previous: BuildChatTranscriptModelInput,
  next: BuildChatTranscriptModelInput,
  overlapLength: number,
) => {
  if (previous.firstUnreadDividerIndex === next.firstUnreadDividerIndex) {
    return true;
  }
  return previous.firstUnreadDividerIndex === null
    && next.firstUnreadDividerIndex !== null
    && next.firstUnreadDividerIndex >= overlapLength
    && next.firstUnreadDividerIndex < next.messages.length;
};

const canSlideUnreadDivider = (
  previous: BuildChatTranscriptModelInput,
  next: BuildChatTranscriptModelInput,
  transition: Extract<MessageTransition, { kind: 'sliding-window' }>,
) => {
  const previousIndex = previous.firstUnreadDividerIndex;
  const nextIndex = next.firstUnreadDividerIndex;
  if (previousIndex === null) {
    return nextIndex === null
      || (
        nextIndex >= transition.overlapLength
        && nextIndex < next.messages.length
      );
  }
  return previousIndex >= transition.droppedCount
    && nextIndex === previousIndex - transition.droppedCount;
};
