import { buildConversationModel } from './conversation-model.js';
import type { State } from './app-types.js';
import type { SelectedBuffer } from './workspace-types.js';

const HISTORY_STATE_KEY = 'pulseteConversationNavigation';
export const HISTORY_STATE_VERSION = 1;

export type HistoryTarget = {
  networkId: string | null;
  selection: SelectedBuffer | null;
};

export type ConversationHistoryEntry = {
  backTarget: HistoryTarget | null;
  index: number;
  target: HistoryTarget;
  version: typeof HISTORY_STATE_VERSION;
};

export const targetFromState = (state: State): HistoryTarget => {
  const selection = state.transient.selection;
  if (!selection) {
    return { networkId: null, selection: null };
  }
  const networkId = selection.kind === 'pending-channel'
    ? selection.networkId
    : state.domain.buffers.find(({ id }) => id === selection.bufferId)?.networkId ?? null;
  return { networkId, selection };
};

export const normalizeHistorySelection = (
  state: State,
  target: HistoryTarget,
) => buildConversationModel({
  buffers: state.domain.buffers,
  channels: state.domain.channels,
  pendingChannels: state.domain.pendingChannels,
}).normalizeSelection(state.domain.networks, target.selection, target.networkId);

export const sameSelection = (
  left: SelectedBuffer | null,
  right: SelectedBuffer | null,
) => {
  if (left?.kind !== right?.kind) {
    return false;
  }
  if (!left || !right) {
    return left === right;
  }
  if (left.kind === 'buffer' && right.kind === 'buffer') {
    return left.bufferId === right.bufferId;
  }
  if (left.kind === 'pending-channel' && right.kind === 'pending-channel') {
    return left.networkId === right.networkId && left.channel === right.channel;
  }
  return false;
};

export const withConversationHistoryEntry = (
  state: unknown,
  entry: ConversationHistoryEntry,
) => ({
  ...(isRecord(state) ? state : {}),
  [HISTORY_STATE_KEY]: entry,
});

export const readConversationHistoryEntry = (
  state: unknown,
): ConversationHistoryEntry | null => {
  if (!isRecord(state)) {
    return null;
  }
  const entry = state[HISTORY_STATE_KEY];
  if (
    !isRecord(entry)
    || entry.version !== HISTORY_STATE_VERSION
    || !Number.isInteger(entry.index)
    || (entry.index as number) < 0
  ) {
    return null;
  }
  const target = readHistoryTarget(entry.target);
  const backTarget = entry.backTarget === undefined || entry.backTarget === null
    ? null
    : readHistoryTarget(entry.backTarget);
  if (
    target === undefined
    || backTarget === undefined
  ) {
    return null;
  }
  return {
    backTarget,
    index: entry.index as number,
    target,
    version: HISTORY_STATE_VERSION,
  };
};

const readHistoryTarget = (value: unknown): HistoryTarget | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const selection = readSelection(value.selection);
  const networkId = value.networkId;
  if (
    selection === undefined
    || (networkId !== null && typeof networkId !== 'string')
  ) {
    return undefined;
  }
  return { networkId, selection };
};

const readSelection = (value: unknown): SelectedBuffer | null | undefined => {
  if (value === null) {
    return null;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  if (value.kind === 'buffer' && typeof value.bufferId === 'string') {
    return { kind: 'buffer', bufferId: value.bufferId };
  }
  if (
    value.kind === 'pending-channel'
    && typeof value.networkId === 'string'
    && typeof value.channel === 'string'
  ) {
    return {
      kind: 'pending-channel',
      networkId: value.networkId,
      channel: value.channel,
    };
  }
  return undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
