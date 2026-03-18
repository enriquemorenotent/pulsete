import type { AppSnapshot, ChannelState, ChatMessage, NetworkProfile, QueryBuffer } from '../../shared/protocol.js';
import type { SessionResponse } from './client.js';
import type { AuthForm, NetworkForm } from './network-form.js';
import type { NetworkRuntimeState, SelectedBuffer } from './workspace-types.js';

export type Banner = { kind: 'notice' | 'error'; message: string } | null;

export type State = {
  phase: 'loading' | 'bootstrap' | 'login' | 'ready';
  authMode: 'signin' | 'signup';
  bootstrapped: boolean;
  user: { id: string; username: string } | null;
  networks: NetworkProfile[];
  channels: ChannelState[];
  queries: QueryBuffer[];
  messages: ChatMessage[];
  networkStates: Record<string, NetworkRuntimeState>;
  selection: SelectedBuffer | null;
  networkForm: NetworkForm;
  authForm: AuthForm;
  banner: Banner;
  historyLoading: boolean;
};

export type Action =
  | { type: 'session-loaded'; session: SessionResponse }
  | { type: 'snapshot'; snapshot: AppSnapshot }
  | { type: 'upsert-network'; network: NetworkProfile }
  | { type: 'set-auth-mode'; mode: 'signin' | 'signup' }
  | { type: 'select'; selection: SelectedBuffer }
  | { type: 'upsert-query'; query: QueryBuffer }
  | { type: 'remove-query'; networkId: string; target: string }
  | { type: 'append-message'; message: ChatMessage }
  | { type: 'append-messages'; messages: ChatMessage[] }
  | { type: 'upsert-channel'; channel: ChannelState }
  | { type: 'remove-channel'; channelId: string; networkId: string }
  | { type: 'update-presence'; networkId: string; channel: string; users: string[] }
  | { type: 'network-connecting'; networkId: string; nick: string }
  | { type: 'network-state'; networkId: string; connected: boolean; serverName: string | null; nick: string }
  | { type: 'set-banner'; banner: Banner }
  | { type: 'set-network-form'; form: Partial<NetworkForm> }
  | { type: 'reset-network-form'; form?: Partial<NetworkForm> }
  | { type: 'set-auth-form'; field: keyof AuthForm; value: string }
  | { type: 'set-history-loading'; value: boolean }
  | { type: 'remove-network'; networkId: string };
