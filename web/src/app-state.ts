import { useState } from 'react';
import type { AppSnapshot, BufferState, ChatMessage } from '../../shared/protocol.js';
import { emptyNetworkForm } from './network-form.js';
import { selectDefaultBuffer } from './workspace.js';
import type { Action, State } from './app-types.js';

export const initialState: State = {
  phase: 'loading',
  networks: [],
  buffers: [],
  channels: [],
  messages: [],
  networkStates: {},
  selection: null,
  networkForm: emptyNetworkForm(),
  banner: null,
  historyLoading: false,
};

const mergeMessages = (current: ChatMessage[], incoming: ChatMessage[]) => {
  const merged = new Map<string, ChatMessage>();
  for (const message of current) {
    merged.set(message.id, message);
  }
  for (const message of incoming) {
    merged.set(message.id, message);
  }
  return Array.from(merged.values()).sort((left, right) => left.ts - right.ts);
};

const sortBuffers = (buffers: BufferState[]) =>
  [...buffers].sort((left, right) =>
    left.networkId === right.networkId
      ? left.target.localeCompare(right.target)
      : left.networkId.localeCompare(right.networkId)
  );

const fallbackSelection = (state: Pick<State, 'networks' | 'buffers'>, preferredNetworkId?: string | null) => {
  if (preferredNetworkId) {
    const buffer = state.buffers.find((candidate) => candidate.networkId === preferredNetworkId && candidate.kind === 'server') ?? null;
    if (buffer) {
      return { bufferId: buffer.id };
    }
  }
  return selectDefaultBuffer(state as Pick<AppSnapshot, 'networks' | 'buffers'>);
};

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'snapshot-loaded':
      return {
        ...state,
        phase: 'ready',
        networks: action.snapshot.networks,
        buffers: sortBuffers(action.snapshot.buffers),
        channels: action.snapshot.channels,
        messages: action.snapshot.messages,
        selection: selectDefaultBuffer(action.snapshot),
        banner: null,
      };
    case 'snapshot':
      return {
        ...state,
        phase: 'ready',
        networks: action.snapshot.networks,
        buffers: sortBuffers(action.snapshot.buffers),
        channels: action.snapshot.channels,
        messages: mergeMessages(state.messages, action.snapshot.messages),
        selection: state.selection ?? selectDefaultBuffer(action.snapshot),
      };
    case 'load-failed':
      return { ...state, phase: 'ready' };
    case 'upsert-network': {
      const networks = state.networks.filter((network) => network.id !== action.network.id);
      networks.push(action.network);
      return { ...state, networks: networks.sort((left, right) => left.name.localeCompare(right.name)) };
    }
    case 'upsert-buffer': {
      const buffers = state.buffers.filter((buffer) => buffer.id !== action.buffer.id);
      buffers.push(action.buffer);
      return { ...state, buffers: sortBuffers(buffers) };
    }
    case 'remove-buffer': {
      const buffers = state.buffers.filter((buffer) => buffer.id !== action.bufferId);
      const channels = state.channels.filter((channel) => channel.id !== action.bufferId);
      const messages = state.messages.filter((message) => {
        const removedBuffer = state.buffers.find((buffer) => buffer.id === action.bufferId);
        if (!removedBuffer) {
          return true;
        }
        return !(message.networkId === removedBuffer.networkId && message.target === removedBuffer.target);
      });
      const selection = state.selection?.bufferId === action.bufferId
        ? fallbackSelection({ networks: state.networks, buffers }, action.networkId)
        : state.selection;
      return { ...state, buffers, channels, messages, selection };
    }
    case 'select':
      return { ...state, selection: action.selection, banner: null };
    case 'append-message':
      return { ...state, messages: mergeMessages(state.messages, [action.message]) };
    case 'append-messages':
      return { ...state, messages: mergeMessages(state.messages, action.messages) };
    case 'upsert-channel': {
      const channels = state.channels.filter((channel) => channel.id !== action.channel.id);
      channels.push(action.channel);
      return { ...state, channels: channels.sort((left, right) => left.name.localeCompare(right.name)) };
    }
    case 'remove-channel':
      return {
        ...state,
        channels: state.channels.filter((channel) => channel.id !== action.channelId),
      };
    case 'update-presence':
      return {
        ...state,
        channels: state.channels.map((channel) =>
          channel.networkId === action.networkId && channel.name === action.channel
            ? { ...channel, users: action.users }
            : channel
        ),
      };
    case 'network-connecting':
      return {
        ...state,
        networkStates: {
          ...state.networkStates,
          [action.networkId]: { connected: false, connecting: true, serverName: null, nick: action.nick },
        },
      };
    case 'network-state':
      return {
        ...state,
        networkStates: {
          ...state.networkStates,
          [action.networkId]: {
            connected: action.connected,
            connecting: false,
            serverName: action.serverName,
            nick: action.nick,
          },
        },
      };
    case 'set-banner':
      return { ...state, banner: action.banner };
    case 'set-network-form':
      return { ...state, networkForm: { ...state.networkForm, ...action.form } };
    case 'reset-network-form':
      return { ...state, networkForm: { ...emptyNetworkForm(), ...action.form } };
    case 'set-history-loading':
      return { ...state, historyLoading: action.value };
    case 'remove-network': {
      const networks = state.networks.filter((network) => network.id !== action.networkId);
      const buffers = state.buffers.filter((buffer) => buffer.networkId !== action.networkId);
      const channels = state.channels.filter((channel) => channel.networkId !== action.networkId);
      const messages = state.messages.filter((message) => message.networkId !== action.networkId);
      const networkStates = { ...state.networkStates };
      delete networkStates[action.networkId];
      const selection = state.selection && state.buffers.some((buffer) => buffer.id === state.selection?.bufferId && buffer.networkId === action.networkId)
        ? fallbackSelection({ networks, buffers })
        : state.selection;
      return { ...state, networks, buffers, channels, messages, networkStates, selection };
    }
    default:
      return state;
  }
};

export function useStateReducer<T, A>(reducerFn: (state: T, action: A) => T, initial: T) {
  const [state, setState] = useState(initial);
  const dispatch = (action: A) => setState((current) => reducerFn(current, action));
  return [state, dispatch] as const;
}
