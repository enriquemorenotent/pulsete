import { useState } from 'react';
import type { ChatMessage } from '../../shared/protocol.js';
import { emptyAuthForm, emptyNetworkForm } from './network-form.js';
import { selectDefaultBuffer } from './workspace.js';
import type { Action, State } from './app-types.js';

export const initialState: State = {
  phase: 'loading',
  authMode: 'signin',
  bootstrapped: false,
  user: null,
  networks: [],
  channels: [],
  queries: [],
  messages: [],
  networkStates: {},
  selection: null,
  networkForm: emptyNetworkForm(),
  authForm: emptyAuthForm(),
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

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'session-loaded':
      if (!action.session.bootstrapped) {
        return { ...state, phase: 'bootstrap', bootstrapped: false, authMode: 'signup' };
      }
      if (!action.session.authenticated) {
        return { ...state, phase: 'login', bootstrapped: true, user: null, authMode: 'signin' };
      }
      return {
        ...state,
        phase: 'ready',
        authMode: 'signin',
        bootstrapped: true,
        user: action.session.user,
        networks: action.session.snapshot.networks,
        channels: action.session.snapshot.channels,
        queries: action.session.snapshot.queries,
        messages: action.session.snapshot.messages,
        selection: selectDefaultBuffer(action.session.snapshot),
      };
    case 'snapshot':
      return {
        ...state,
        networks: action.snapshot.networks,
        channels: action.snapshot.channels,
        queries: action.snapshot.queries,
        messages: mergeMessages(state.messages, action.snapshot.messages),
        selection: state.selection ?? selectDefaultBuffer(action.snapshot),
      };
    case 'set-auth-mode':
      return { ...state, authMode: action.mode };
    case 'upsert-network': {
      const networks = state.networks.filter((network) => network.id !== action.network.id);
      networks.push(action.network);
      return { ...state, networks: networks.sort((left, right) => left.name.localeCompare(right.name)) };
    }
    case 'select':
      return { ...state, selection: action.selection, banner: null };
    case 'upsert-query': {
      const queries = state.queries.filter(
        (query) => !(query.networkId === action.query.networkId && query.target === action.query.target)
      );
      queries.push(action.query);
      return {
        ...state,
        queries: queries.sort((left, right) =>
          left.networkId === right.networkId
            ? left.target.localeCompare(right.target)
            : left.networkId.localeCompare(right.networkId)
        ),
      };
    }
    case 'remove-query': {
      const queries = state.queries.filter(
        (query) => !(query.networkId === action.networkId && query.target === action.target)
      );
      const selection =
        state.selection?.networkId === action.networkId &&
        state.selection.channelId === null &&
        state.selection.target === action.target
          ? { networkId: action.networkId, target: 'server', channelId: null }
          : state.selection;
      return { ...state, queries, selection };
    }
    case 'append-message':
      return { ...state, messages: mergeMessages(state.messages, [action.message]) };
    case 'append-messages':
      return { ...state, messages: mergeMessages(state.messages, action.messages) };
    case 'upsert-channel': {
      const next = state.channels.filter((channel) => channel.id !== action.channel.id);
      next.push(action.channel);
      const selection =
        state.selection &&
        state.selection.channelId === null &&
        state.selection.networkId === action.channel.networkId &&
        state.selection.target === action.channel.name
          ? { ...state.selection, channelId: action.channel.id }
          : state.selection;
      return { ...state, channels: next.sort((left, right) => left.name.localeCompare(right.name)), selection };
    }
    case 'remove-channel': {
      const channels = state.channels.filter((channel) => channel.id !== action.channelId);
      const selection =
        state.selection?.channelId === action.channelId
          ? { networkId: action.networkId, target: 'server', channelId: null }
          : state.selection;
      return { ...state, channels, selection };
    }
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
    case 'set-auth-form':
      return { ...state, authForm: { ...state.authForm, [action.field]: action.value } };
    case 'set-history-loading':
      return { ...state, historyLoading: action.value };
    case 'remove-network': {
      const networks = state.networks.filter((network) => network.id !== action.networkId);
      const channels = state.channels.filter((channel) => channel.networkId !== action.networkId);
      const queries = state.queries.filter((query) => query.networkId !== action.networkId);
      const messages = state.messages.filter((message) => message.networkId !== action.networkId);
      const networkStates = { ...state.networkStates };
      delete networkStates[action.networkId];
      const selection = state.selection?.networkId === action.networkId ? selectDefaultBuffer({ networks }) : state.selection;
      return { ...state, networks, channels, queries, messages, networkStates, selection };
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
