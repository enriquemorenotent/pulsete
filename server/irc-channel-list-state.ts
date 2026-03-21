import type { ChannelListEntry } from '../shared/protocol.js';
import type { IrcChannelListMode, IrcChannelListState } from './irc-state-types.js';

export type IrcActiveStructuredChannelListSession = {
  phase: 'active';
  mode: 'structured';
  requestId: string | null;
  sourceTarget: string | null;
  entries: ChannelListEntry[];
};

export type IrcActiveRawChannelListSession = {
  phase: 'active';
  mode: 'raw';
  requestId: string | null;
  sourceTarget: string | null;
  entries: ChannelListEntry[];
};

export type IrcDrainingStructuredChannelListSession = {
  phase: 'draining';
  mode: 'structured';
  requestId: string | null;
  sourceTarget: string | null;
  expiresAt: number;
};

export type IrcDrainingRawChannelListSession = {
  phase: 'draining';
  mode: 'raw';
  requestId: string | null;
  sourceTarget: string | null;
  expiresAt: number;
};

export type IrcChannelListSession =
  | { phase: 'idle' }
  | IrcActiveStructuredChannelListSession
  | IrcActiveRawChannelListSession
  | IrcDrainingStructuredChannelListSession
  | IrcDrainingRawChannelListSession;

export const getChannelListSession = (state: IrcChannelListState): IrcChannelListSession => {
  if (state.active.mode === 'structured') {
    return {
      phase: 'active',
      mode: 'structured',
      requestId: state.active.requestId,
      sourceTarget: state.active.sourceTarget,
      entries: state.active.entries,
    };
  }
  if (state.active.mode === 'raw') {
    return {
      phase: 'active',
      mode: 'raw',
      requestId: state.active.requestId,
      sourceTarget: state.active.sourceTarget,
      entries: state.active.entries,
    };
  }
  if (state.draining.mode === 'structured' && state.draining.expiresAt !== null) {
    return {
      phase: 'draining',
      mode: 'structured',
      requestId: state.draining.requestId,
      sourceTarget: state.draining.sourceTarget,
      expiresAt: state.draining.expiresAt,
    };
  }
  if (state.draining.mode === 'raw' && state.draining.expiresAt !== null) {
    return {
      phase: 'draining',
      mode: 'raw',
      requestId: state.draining.requestId,
      sourceTarget: state.draining.sourceTarget,
      expiresAt: state.draining.expiresAt,
    };
  }
  return { phase: 'idle' };
};

export const isChannelListPending = (state: IrcChannelListState) =>
  getChannelListSession(state).phase !== 'idle';

export const getActiveStructuredChannelListSnapshot = (state: IrcChannelListState) => {
  const session = getChannelListSession(state);
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
  state.active.mode = mode;
  state.active.requestId = mode === 'structured' ? options.requestId ?? null : null;
  state.active.sourceTarget = mode === 'raw' ? options.sourceTarget ?? 'server' : null;
  state.active.entries = [];
  clearDrainingChannelListSession(state);
};

export const appendStructuredChannelListEntry = (
  state: IrcChannelListState,
  requestId: string,
  entry: ChannelListEntry
): IrcActiveStructuredChannelListSession | null => {
  const session = getChannelListSession(state);
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
  const session = getChannelListSession(state);
  if (session.phase === 'active' && session.mode === 'structured' && session.requestId === requestId) {
    clearActiveChannelListSession(state);
    return 'completed';
  }
  if (session.phase === 'draining' && session.mode === 'structured' && session.requestId === requestId) {
    clearDrainingChannelListSession(state);
    return 'drained';
  }
  return null;
};

export const moveActiveChannelListToDraining = (
  state: IrcChannelListState
): IrcActiveStructuredChannelListSession | IrcActiveRawChannelListSession | null => {
  const session = getChannelListSession(state);
  if (session.phase !== 'active') {
    return null;
  }
  clearActiveChannelListSession(state);
  state.draining.mode = session.mode;
  state.draining.requestId = session.requestId;
  state.draining.sourceTarget = session.sourceTarget;
  state.draining.expiresAt = Date.now() + state.drainGraceMs;
  return session;
};

export const clearActiveChannelListSession = (state: IrcChannelListState) => {
  state.active.mode = null;
  state.active.requestId = null;
  state.active.sourceTarget = null;
  state.active.entries = [];
};

export const clearDrainingChannelListSession = (state: IrcChannelListState) => {
  state.draining.mode = null;
  state.draining.requestId = null;
  state.draining.sourceTarget = null;
  state.draining.expiresAt = null;
};

export const matchesChannelListSession = (
  expected: IrcActiveStructuredChannelListSession | IrcActiveRawChannelListSession,
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
