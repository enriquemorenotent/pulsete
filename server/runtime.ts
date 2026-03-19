import WebSocket from 'ws';
import { encode, type NetworkProfile, type ServerMessage } from '../shared/protocol.js';
import { notFound } from './app-error.js';
import { IrcConnection } from './irc.js';
import {
  normalizeChannelTarget,
  normalizeMessageBody,
  normalizeMessageTarget,
  normalizeQueryTarget,
  normalizeRawCommand,
} from './irc-validate.js';
import { handleRuntimeEvent } from './runtime-events.js';
import { Storage, type NetworkInput } from './storage.js';

export class Runtime {
  readonly store: Storage;
  private readonly sockets = new Set<WebSocket>();
  private readonly connections = new Map<string, IrcConnection>();
  private closing = false;

  constructor(store: Storage) {
    this.store = store;
  }

  attachSocket(ws: WebSocket) {
    this.sockets.add(ws);
    ws.on('close', () => this.sockets.delete(ws));
  }

  revokeSession(_sessionToken: string, _legacyUserId?: string) {}

  send(message: ServerMessage): void;
  send(_legacyUserId: string, message: ServerMessage): void;
  send(messageOrLegacyUserId: ServerMessage | string, maybeMessage?: ServerMessage) {
    const message = typeof messageOrLegacyUserId === 'string' ? maybeMessage : messageOrLegacyUserId;
    if (!message) {
      return;
    }
    const payload = encode(message);
    for (const ws of Array.from(this.sockets)) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
        continue;
      }
      if (ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) {
        this.sockets.delete(ws);
      }
    }
  }

  close() {
    this.closing = true;
    for (const ws of Array.from(this.sockets)) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1001, 'Server shutting down');
      }
    }
    this.sockets.clear();
    for (const connection of this.connections.values()) {
      connection.disconnect();
    }
    this.connections.clear();
  }

  snapshot(): ReturnType<Storage['snapshot']>;
  snapshot(_legacyUserId: string): ReturnType<Storage['snapshot']>;
  snapshot(_legacyUserId?: string) { return this.store.snapshot(); }

  connect(networkId: string): void;
  connect(_legacyUserId: string, networkId: string, _legacySessionToken?: string): void;
  connect(networkIdOrLegacyUserId: string, maybeNetworkId?: string) {
    this.ensureConnection(resolveNetworkId(networkIdOrLegacyUserId, maybeNetworkId)).connect();
  }

  disconnect(networkId: string): void;
  disconnect(_legacyUserId: string, networkId: string): void;
  disconnect(networkIdOrLegacyUserId: string, maybeNetworkId?: string) {
    const networkId = resolveNetworkId(networkIdOrLegacyUserId, maybeNetworkId);
    this.getRequiredNetwork(networkId);
    this.connections.get(networkId)?.disconnect();
  }

  join(networkId: string, channel: string): void;
  join(_legacyUserId: string, networkId: string, channel: string): void;
  join(networkIdOrLegacyUserId: string, maybeNetworkIdOrChannel: string, maybeChannel?: string) {
    const { networkId, value: channel } = resolveNetworkAndValue(
      networkIdOrLegacyUserId,
      maybeNetworkIdOrChannel,
      maybeChannel
    );
    this.ensureConnection(networkId).join(normalizeChannelTarget(channel));
  }

  part(networkId: string, channel: string): void;
  part(_legacyUserId: string, networkId: string, channel: string): void;
  part(networkIdOrLegacyUserId: string, maybeNetworkIdOrChannel: string, maybeChannel?: string) {
    const { networkId, value: channel } = resolveNetworkAndValue(
      networkIdOrLegacyUserId,
      maybeNetworkIdOrChannel,
      maybeChannel
    );
    this.getRequiredNetwork(networkId);
    this.connections.get(networkId)?.part(normalizeChannelTarget(channel));
  }

  openQuery(networkId: string, target: string): ReturnType<Storage['upsertQuery']>;
  openQuery(_legacyUserId: string, networkId: string, target: string): ReturnType<Storage['upsertQuery']>;
  openQuery(networkIdOrLegacyUserId: string, networkIdOrTarget: string, maybeTarget?: string) {
    return this.openQueryInternal(...resolveArgsWithValue(arguments));
  }

  closeQuery(networkId: string, target: string): string;
  closeQuery(_legacyUserId: string, networkId: string, target: string): string;
  closeQuery(networkIdOrLegacyUserId: string, networkIdOrTarget: string, maybeTarget?: string) {
    return this.closeQueryInternal(...resolveArgsWithValue(arguments));
  }

  markChannelRead(channelId: string): ReturnType<Storage['getChannel']>;
  markChannelRead(_legacyUserId: string, channelId: string): ReturnType<Storage['getChannel']>;
  markChannelRead(channelIdOrLegacyUserId: string, maybeChannelId?: string) {
    return this.markChannelReadInternal(resolveChannelId(arguments));
  }

  history(networkId: string, target: string, limit: number): ReturnType<Storage['listMessages']>;
  history(_legacyUserId: string, networkId: string, target: string, limit: number): ReturnType<Storage['listMessages']>;
  history(
    networkIdOrLegacyUserId: string,
    networkIdOrTarget: string,
    targetOrLimit: string | number,
    maybeLimit?: number
  ) {
    return this.historyInternal(...resolveArgsWithLimit(arguments));
  }

  saveNetwork(data: unknown): ReturnType<Storage['upsertNetwork']>;
  saveNetwork(_legacyUserId: string, data: unknown): ReturnType<Storage['upsertNetwork']>;
  saveNetwork(dataOrLegacyUserId: unknown, maybeData?: unknown) {
    return this.saveNetworkInternal(resolveNetworkInput(arguments));
  }

  sendMessage(networkId: string, target: string, body: string, kind?: 'message' | 'action'): void;
  sendMessage(_legacyUserId: string, networkId: string, target: string, body: string, kind?: 'message' | 'action'): void;
  sendMessage(
    networkIdOrLegacyUserId: string,
    networkIdOrTarget: string,
    targetOrBody: string,
    bodyOrKind?: string,
    maybeKind?: 'message' | 'action'
  ) {
    return this.sendMessageInternal(...resolveMessageArgs(arguments));
  }

  sendRaw(networkId: string, raw: string): void;
  sendRaw(_legacyUserId: string, networkId: string, raw: string): void;
  sendRaw(networkIdOrLegacyUserId: string, networkIdOrRaw: string, maybeRaw?: string) {
    return this.sendRawInternal(...resolveArgsWithValue(arguments));
  }

  deleteNetwork(networkId: string): string[];
  deleteNetwork(_legacyUserId: string, networkId: string): string[];
  deleteNetwork(networkIdOrLegacyUserId: string, maybeNetworkId?: string) {
    return this.deleteNetworkInternal(resolveNetworkIdFromArgs(arguments));
  }

  private openQueryInternal(networkId: string, target: string) {
    this.getRequiredNetwork(networkId);
    return this.store.upsertQuery(networkId, normalizeQueryTarget(target));
  }

  private closeQueryInternal(networkId: string, target: string) {
    this.getRequiredNetwork(networkId);
    const normalizedTarget = normalizeQueryTarget(target);
    this.store.deleteQuery(networkId, normalizedTarget);
    return normalizedTarget;
  }

  private markChannelReadInternal(channelId: string) {
    const channel = this.getRequiredChannel(channelId);
    if (channel.unread === 0) {
      return channel;
    }
    this.store.markChannelRead(channelId);
    const updatedChannel = this.getRequiredChannel(channelId);
    this.send({ type: 'channel.snapshot', channel: updatedChannel });
    return updatedChannel;
  }

  private historyInternal(networkId: string, target: string, limit: number) {
    this.getRequiredNetwork(networkId);
    return this.store.listMessages(networkId, target, limit);
  }

  private saveNetworkInternal(data: unknown) {
    const input = data as NetworkInput;
    if (input.id) {
      this.getRequiredNetwork(input.id);
    }
    const profile = this.store.upsertNetwork(input);
    const updatedProfiles = [profile, ...this.syncTemplateInstances(profile, input)];
    for (const updatedProfile of updatedProfiles) {
      const runtimeProfile = this.store.getRuntimeNetwork(updatedProfile.id);
      if (runtimeProfile) {
        this.connections.get(updatedProfile.id)?.updateProfile(runtimeProfile);
      }
      this.send({ type: 'network.upsert', network: updatedProfile });
    }
    return profile;
  }

  private sendMessageInternal(networkId: string, target: string, body: string, kind: 'message' | 'action' = 'message') {
    const normalizedTarget = normalizeMessageTarget(target);
    const normalizedBody = normalizeMessageBody(body);
    const connection = this.ensureConnection(networkId);
    kind === 'action' ? connection.action(normalizedTarget, normalizedBody) : connection.say(normalizedTarget, normalizedBody);
  }

  private sendRawInternal(networkId: string, raw: string) {
    const normalizedRaw = normalizeRawCommand(raw);
    const connection = this.ensureConnection(networkId);
    if (/^\s*NICK\s+/i.test(normalizedRaw)) {
      const nextNick = normalizedRaw.trim().split(/\s+/)[1];
      if (nextNick) {
        if (connection.socket) {
          connection.setNick(nextNick);
        } else {
          connection.sendRaw(normalizedRaw);
        }
        return;
      }
    }
    if (/^\s*QUIT(?:\s|$)/i.test(normalizedRaw)) {
      if (connection.socket) {
        connection.disconnect(normalizedRaw.trim());
      } else {
        connection.sendRaw(normalizedRaw);
      }
      return;
    }
    connection.sendRaw(normalizedRaw);
  }

  private deleteNetworkInternal(networkId: string) {
    const deletedNetworkIds = this.getDeleteTargetIds(networkId);
    for (const targetId of deletedNetworkIds) {
      this.connections.get(targetId)?.disconnect();
      this.connections.delete(targetId);
    }
    this.store.deleteNetwork(networkId);
    for (const targetId of deletedNetworkIds) {
      this.send({ type: 'network.remove', networkId: targetId });
    }
    return deletedNetworkIds;
  }

  private ensureConnection(networkId: string) {
    const profile = this.getRequiredRuntimeNetwork(networkId);
    let connection = this.connections.get(networkId);
    if (!connection) {
      connection = new IrcConnection(profile, {
        onEvent: (event) => {
          if (!this.closing) {
            handleRuntimeEvent(this, event);
          }
        },
      });
      this.connections.set(networkId, connection);
    }
    return connection;
  }

  private getRequiredRuntimeNetwork(networkId: string) {
    const profile = this.store.getRuntimeNetwork(networkId);
    if (!profile) {
      throw notFound('Network not found');
    }
    return profile;
  }

  private getRequiredNetwork(networkId: string) {
    const profile = this.store.getNetwork(networkId);
    if (!profile) {
      throw notFound('Network not found');
    }
    return profile;
  }

  private getRequiredChannel(channelId: string) {
    const channel = this.store.getChannel(channelId);
    if (!channel) {
      throw notFound('Channel not found');
    }
    return channel;
  }

  private getDeleteTargetIds(networkId: string) {
    const network = this.getRequiredNetwork(networkId);
    return this.store
      .listNetworks()
      .filter((candidate) => candidate.id === network.id || candidate.templateId === network.id)
      .map((candidate) => candidate.id);
  }

  private syncTemplateInstances(
    profile: NetworkProfile,
    input: NetworkInput
  ) {
    if (profile.managerHidden) {
      return [];
    }
    return this.store
      .listNetworks()
      .filter((candidate) => candidate.managerHidden && candidate.templateId === profile.id)
      .map((candidate) => this.store.upsertNetwork({
        id: candidate.id,
        templateId: profile.id,
        managerHidden: true,
        name: profile.name,
        host: profile.host,
        port: profile.port,
        tls: profile.tls,
        nick: profile.nick,
        altNicks: profile.altNicks,
        username: profile.username,
        realName: profile.realName,
        favorite: profile.favorite,
        autoJoin: profile.autoJoin,
        ...(input.password !== undefined ? { password: input.password } : {}),
        ...(input.clearPassword ? { clearPassword: true } : {}),
      }));
  }
}

const resolveNetworkId = (networkIdOrLegacyUserId: string, maybeNetworkId?: string) =>
  maybeNetworkId ?? networkIdOrLegacyUserId;

const resolveNetworkAndValue = (
  networkIdOrLegacyUserId: string,
  maybeNetworkIdOrValue: string,
  maybeValue?: string
) => ({
  networkId: maybeValue ? maybeNetworkIdOrValue : networkIdOrLegacyUserId,
  value: maybeValue ?? maybeNetworkIdOrValue,
});

const resolveArgsWithValue = (args: IArguments) =>
  args.length === 3
    ? [String(args[1]), String(args[2])] as const
    : [String(args[0]), String(args[1])] as const;

const resolveChannelId = (args: IArguments) =>
  args.length === 2 ? String(args[1]) : String(args[0]);

const resolveArgsWithLimit = (args: IArguments) =>
  args.length === 4
    ? [String(args[1]), String(args[2]), Number(args[3])] as const
    : [String(args[0]), String(args[1]), Number(args[2])] as const;

const resolveNetworkInput = (args: IArguments) =>
  args.length === 2 ? args[1] : args[0];

const resolveNetworkIdFromArgs = (args: IArguments) =>
  args.length === 2 ? String(args[1]) : String(args[0]);

const resolveMessageArgs = (args: IArguments) => {
  if (args.length >= 5) {
    return [String(args[1]), String(args[2]), String(args[3]), args[4] as 'message' | 'action'] as const;
  }
  return [String(args[0]), String(args[1]), String(args[2]), (args[3] as 'message' | 'action' | undefined) ?? 'message'] as const;
};
