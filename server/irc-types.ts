import type net from 'node:net';
import type tls from 'node:tls';
import type { NetworkProfile } from '../shared/protocol.js';
import type { MessageInput } from './storage.js';

export type RuntimeEvent =
  | { type: 'state'; networkId: string; connected: boolean; serverName: string | null; nick: string }
  | { type: 'status'; networkId: string; message: string; kind: 'notice' | 'error' | 'system' }
  | { type: 'message'; message: MessageInput }
  | { type: 'channel'; networkId: string; channel: string; topic?: string; users?: string[] };

export type Handlers = {
  onEvent: (event: RuntimeEvent) => void;
};

export type IrcSocket = net.Socket | tls.TLSSocket;

export type ParsedLine = {
  prefix: string | null;
  command: string;
  params: string[];
};

export type IrcConnectionState = {
  profile: NetworkProfile;
  handlers: Handlers;
  socket: IrcSocket | null;
  buffer: string;
  channelUsers: Map<string, Set<string>>;
  manualDisconnect: boolean;
  reconnectAttempts: number;
  connected: boolean;
  serverName: string | null;
  currentNick: string;
  connect(): void;
  consume(chunk: string): void;
  join(channel: string): void;
  resetTransientState(): void;
  sendRaw(raw: string): boolean;
  updateChannelUsers(channel: string, nick: string | null, joined: boolean): string[];
};
