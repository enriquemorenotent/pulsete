import type { ChannelListEntry } from '../shared/protocol.js';
import type { IrcChannelListState } from './irc-types.js';

type ChannelListMode = NonNullable<IrcChannelListState['active']['mode']>;

export type IrcChannelListSession =
  | { phase: 'idle' }
  | {
      phase: 'active';
      mode: ChannelListMode;
      requestId: string | null;
      sourceTarget: string | null;
      entries: ChannelListEntry[];
    }
  | {
      phase: 'draining';
      mode: ChannelListMode;
      requestId: string | null;
      sourceTarget: string | null;
      expiresAt: number;
    };

export const getChannelListSession = (state: IrcChannelListState): IrcChannelListSession => {
  if (state.active.mode) {
    return {
      phase: 'active',
      mode: state.active.mode,
      requestId: state.active.requestId,
      sourceTarget: state.active.sourceTarget,
      entries: state.active.entries,
    };
  }
  if (state.draining.mode && state.draining.expiresAt !== null) {
    return {
      phase: 'draining',
      mode: state.draining.mode,
      requestId: state.draining.requestId,
      sourceTarget: state.draining.sourceTarget,
      expiresAt: state.draining.expiresAt,
    };
  }
  return { phase: 'idle' };
};

export const setActiveChannelListSession = (
  state: IrcChannelListState,
  mode: ChannelListMode,
  options: { requestId?: string; sourceTarget?: string }
) => {
  state.active.mode = mode;
  state.active.requestId = mode === 'structured' ? options.requestId ?? null : null;
  state.active.sourceTarget = mode === 'raw' ? options.sourceTarget ?? 'server' : null;
  state.active.entries = [];
  state.draining.mode = null;
  state.draining.requestId = null;
  state.draining.sourceTarget = null;
  state.draining.expiresAt = null;
};

export const setDrainingChannelListSession = (
  state: IrcChannelListState,
  session: Extract<IrcChannelListSession, { phase: 'active' }>
) => {
  state.active.mode = null;
  state.active.requestId = null;
  state.active.sourceTarget = null;
  state.active.entries = [];
  state.draining.mode = session.mode;
  state.draining.requestId = session.requestId;
  state.draining.sourceTarget = session.sourceTarget;
  state.draining.expiresAt = Date.now() + state.drainGraceMs;
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
  expected: Extract<IrcChannelListSession, { phase: 'active' }>,
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
