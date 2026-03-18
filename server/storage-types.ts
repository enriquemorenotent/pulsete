import type { AppSnapshot, ChannelState, NetworkProfile, QueryBuffer } from '../shared/protocol.js';

export type UserRow = {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  createdAt: number;
};

export type SessionRow = {
  token: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
};

export type NetworkRow = {
  id: string;
  userId: string;
  templateId: string | null;
  managerHidden: number;
  name: string;
  host: string;
  port: number;
  tls: number;
  nick: string;
  altNicks: string;
  username: string;
  realName: string;
  password: string | null;
  favorite: number;
  autoJoin: string;
  createdAt: number;
  updatedAt: number;
};

export type ChannelRow = {
  id: string;
  userId: string;
  networkId: string;
  name: string;
  topic: string;
  unread: number;
  users: string;
  createdAt: number;
  updatedAt: number;
};

export type QueryRow = {
  id: string;
  userId: string;
  networkId: string;
  target: string;
  createdAt: number;
  updatedAt: number;
};

export type MessageRow = {
  id: string;
  userId: string;
  networkId: string;
  target: string;
  nick: string | null;
  body: string;
  kind: string;
  self: number;
  ts: number;
};

export type AuthUser = {
  id: string;
  username: string;
};

export type RuntimeNetworkProfile = NetworkProfile & {
  password?: string;
};

export type NetworkInput = Omit<NetworkProfile, 'id' | 'hasPassword'> & {
  id?: string;
  password?: string;
  clearPassword?: boolean;
};

export type ChannelInput = Omit<ChannelState, 'id' | 'topic' | 'unread' | 'users'> &
  Partial<Pick<ChannelState, 'id' | 'topic' | 'unread' | 'users'>>;

export type MessageInput = {
  id: string;
  networkId: string;
  target: string;
  nick: string | null;
  body: string;
  kind: AppSnapshot['messages'][number]['kind'];
  self: boolean;
  ts: number;
};

export type SessionRecord = SessionRow & { user: AuthUser };

export type CountRow = { count: number };

export type NetworkCountRow = CountRow;

export type QueryRecord = QueryBuffer;
