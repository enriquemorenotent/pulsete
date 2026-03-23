import type { ChannelListEntry } from '../shared/protocol.js';
import type {
  IrcChannelListActiveState,
  IrcChannelListMode,
  IrcChannelListSession,
  IrcChannelListState,
} from './irc-state-types.js';

export type {
  IrcChannelListActiveState,
  IrcChannelListDrainingState,
  IrcChannelListSession,
} from './irc-state-types.js';

export const getChannelListSession = (state: IrcChannelListState): IrcChannelListSession => state.session;

export const isChannelListPending = (state: IrcChannelListState) =>
  state.session.phase !== 'idle';

export const getActiveStructuredChannelListSnapshot = (state: IrcChannelListState) => {
  const session = state.session;
  if (session.phase !== 'active' || session.mode !== 'structured' || !session.requestId) {
    return null;
  }
  return {
    requestId: session.requestId,
    entries: [...session.entries],
  };
};

export const startChannelListSession = (
  state: IrcChannelListState,
  mode: IrcChannelListMode,
  options: { requestId?: string; sourceTarget?: string }
) => {
  state.session = mode === 'structured'
    ? {
        phase: 'active',
        mode,
        requestId: options.requestId ?? null,
        sourceTarget: null,
        entries: [],
      }
    : {
        phase: 'active',
        mode,
        requestId: null,
        sourceTarget: options.sourceTarget ?? 'server',
        entries: [],
      };
};

export const appendStructuredChannelListEntry = (
  state: IrcChannelListState,
  requestId: string,
  entry: ChannelListEntry
): Extract<IrcChannelListActiveState, { mode: 'structured' }> | null => {
  const session = state.session;
  if (session.phase !== 'active' || session.mode !== 'structured' || session.requestId !== requestId) {
    return null;
  }
  session.entries.push(entry);
  return session;
};

export const finishStructuredChannelListSession = (
  state: IrcChannelListState,
  requestId: string
): 'completed' | 'drained' | null => {
  const session = state.session;
  if (session.phase === 'active' && session.mode === 'structured' && session.requestId === requestId) {
    state.session = { phase: 'idle' };
    return 'completed';
  }
  if (session.phase === 'draining' && session.mode === 'structured' && session.requestId === requestId) {
    state.session = { phase: 'idle' };
    return 'drained';
  }
  return null;
};

export const moveActiveChannelListToDraining = (
  state: IrcChannelListState
): IrcChannelListActiveState | null => {
  const session = state.session;
  if (session.phase !== 'active') {
    return null;
  }
  state.session = session.mode === 'structured'
    ? {
        phase: 'draining',
        mode: 'structured',
        requestId: session.requestId,
        sourceTarget: null,
        expiresAt: Date.now() + state.drainGraceMs,
      }
    : {
        phase: 'draining',
        mode: 'raw',
        requestId: null,
        sourceTarget: session.sourceTarget,
        expiresAt: Date.now() + state.drainGraceMs,
      };
  return session;
};

export const clearActiveChannelListSession = (state: IrcChannelListState) => {
  if (state.session.phase === 'active') {
    state.session = { phase: 'idle' };
  }
};

export const clearDrainingChannelListSession = (state: IrcChannelListState) => {
  if (state.session.phase === 'draining') {
    state.session = { phase: 'idle' };
  }
};

export const matchesChannelListSession = (
  expected: IrcChannelListActiveState,
  actual: IrcChannelListSession
) => {
  if (actual.phase !== 'active' || actual.mode !== expected.mode) {
    return false;
  }
  if (expected.mode === 'structured') {
    return actual.requestId === expected.requestId;
  }
  return actual.sourceTarget === expected.sourceTarget;
};
