import { tmpdir } from 'node:os';
import type {
  AssistantAccount,
  AssistantActiveBuffer,
  AssistantAttachmentMetadata,
  AssistantRateLimits,
  AssistantTurnRouting,
  AssistantTurnStatus,
} from '../shared/protocol.js';

export const assistantSandboxCwd = tmpdir();
export const assistantThreadSandbox = 'read-only';
export const assistantTurnSandboxPolicy = {
  type: 'readOnly',
  access: {
    type: 'restricted',
    includePlatformDefaults: false,
    readableRoots: [],
  },
  networkAccess: false,
} as const;

export type RawAccount =
  | { type: 'apiKey' }
  | { type: 'chatgpt'; email: string; planType: AssistantAccount extends { type: 'chatgpt'; planType: infer T } ? T : never };

export type RawRateLimits = {
  limitId: string | null;
  limitName?: string | null;
  primary?: { usedPercent: number; windowDurationMins: number | null; resetsAt: number | null } | null;
  secondary?: { usedPercent: number; windowDurationMins: number | null; resetsAt: number | null } | null;
  credits?: { hasCredits: boolean; unlimited: boolean; balance: string | null } | null;
  planType?: AssistantRateLimits['planType'];
};

export type RawRateLimitReadResponse = {
  rateLimits: RawRateLimits;
  rateLimitsByLimitId?: Record<string, RawRateLimits>;
};

export type RawModel = {
  id: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  hidden: boolean;
};

export type RawThreadStartResponse = {
  thread: {
    id: string;
  };
};

export type RawThreadReadResponse = {
  thread: {
    id: string;
    turns: RawTurn[];
  };
};

export type RawTurn = {
  id: string;
  status: string;
  error: unknown;
  items: RawThreadItem[];
};

export type RawThreadItem =
  | { type: 'userMessage'; id: string; content: Array<{ type: string; text?: string }> }
  | { type: 'agentMessage'; id: string; text: string; phase: string | null }
  | { type: 'plan'; id: string; text: string }
  | { type: 'reasoning'; id: string; summary: string[]; content: string[] }
  | { type: string; id: string; [key: string]: unknown };

export type LoginResponse = {
  type: 'chatgpt';
  loginId: string;
  authUrl: string;
};

export type LiveTurnState = {
  threadId: string;
  executionThreadId: string | null;
  remoteTurnId: string | null;
  turn: import('../shared/protocol.js').AssistantTurn;
};

export type PendingExecutionBase = {
  activeBuffer: AssistantActiveBuffer | null;
  attachments: AssistantAttachmentMetadata[];
  localTurnId: string;
  prompt: string;
  resolvedSubject: AssistantActiveBuffer | null;
  routing: AssistantTurnRouting | null;
  threadId: string;
};

export type QueuedExecution = PendingExecutionBase & {
  kind: 'turn';
};

export type PendingExecution = QueuedExecution & {
  executionThreadId: string;
};

export const localAssistantThreadIdPrefix = 'assistant:';
export const localAssistantTurnIdPrefix = 'assistant-turn:';
export const assistantTranscriptTurnLimit = 8;
export const staleTurnFailureMessage = 'Assistant service restarted before this turn finished';

export const isLocalAssistantThreadId = (threadId: string) => threadId.startsWith(localAssistantThreadIdPrefix);

export const toTurnStatus = (status: string): AssistantTurnStatus =>
  status === 'completed' || status === 'failed' || status === 'interrupted'
    ? status
    : 'inProgress';

export const toTurnError = (error: unknown) => {
  if (!error) {
    return null;
  }
  if (typeof error === 'string') {
    return normalizeTurnErrorMessage(error);
  }
  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') {
    return normalizeTurnErrorMessage(error.message);
  }
  return 'Assistant turn failed';
};

export const normalizeTurnErrorMessage = (message: string) => {
  try {
    const parsed = JSON.parse(message) as {
      error?: { message?: unknown };
      message?: unknown;
    };
    if (parsed?.error && typeof parsed.error.message === 'string') {
      return parsed.error.message;
    }
    if (typeof parsed?.message === 'string') {
      return parsed.message;
    }
  } catch {
    return message;
  }
  return message;
};

export const toRateLimits = (
  rateLimits: RawRateLimits,
  previous: AssistantRateLimits | null = null,
): AssistantRateLimits => ({
  limitId: rateLimits.limitId,
  limitName: rateLimits.limitName === undefined ? previous?.limitName ?? null : rateLimits.limitName,
  primary: rateLimits.primary === undefined ? previous?.primary ?? null : rateLimits.primary,
  secondary: rateLimits.secondary === undefined ? previous?.secondary ?? null : rateLimits.secondary,
  credits: rateLimits.credits === undefined ? previous?.credits ?? null : rateLimits.credits,
  planType: rateLimits.planType === undefined ? previous?.planType ?? null : rateLimits.planType,
});

export const toRateLimitBuckets = (response: RawRateLimitReadResponse): AssistantRateLimits[] => {
  const fallback = [toRateLimits(response.rateLimits)];
  if (!response.rateLimitsByLimitId) {
    return fallback;
  }
  const currentLimitId = response.rateLimits.limitId;
  const ordered = Object.values(response.rateLimitsByLimitId).map((bucket) => toRateLimits(bucket));
  if (!currentLimitId) {
    return ordered.length > 0 ? ordered : fallback;
  }
  const current = ordered.find((bucket) => bucket.limitId === currentLimitId) ?? fallback[0]!;
  const remaining = ordered.filter((bucket) => bucket.limitId !== currentLimitId);
  return [current, ...remaining];
};

export const mergeRateLimitBuckets = (
  currentBuckets: AssistantRateLimits[],
  nextBucket: AssistantRateLimits | null
) => {
  if (!nextBucket) {
    return currentBuckets;
  }
  if (!nextBucket.limitId) {
    return currentBuckets.length > 0 ? [nextBucket, ...currentBuckets.slice(1)] : [nextBucket];
  }
  const existing = currentBuckets.filter((bucket) => bucket.limitId !== nextBucket.limitId);
  return [nextBucket, ...existing];
};

export const isString = (value: unknown): value is string => typeof value === 'string';
