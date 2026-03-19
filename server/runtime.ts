import WebSocket from 'ws';
import { encode, type BufferState, type NetworkProfile, type ServerMessage } from '../shared/protocol.js';
import { badRequest, notFound } from './app-error.js';
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

type SaveNetworkResult = {
  network: NetworkProfile;
  serverBuffer: BufferState | null;
};

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

  join(networkId: string, channel: string): BufferState;
  join(_legacyUserId: string, networkId: string, channel: string): BufferState;
  join(networkIdOrLegacyUserId: string, maybeNetworkIdOrChannel: string, maybeChannel?: string) {
    const { networkId, value: channel } = resolveNetworkAndValue(
      networkIdOrLegacyUserId,
      maybeNetworkIdOrChannel,
      maybeChannel
    );
    return this.joinInternal(networkId, channel);
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
    const normalizedChannel = normalizeChannelTarget(channel);
    this.connections.get(networkId)?.part(normalizedChannel);
  }

  openQuery(networkId: string, target: string): ReturnType<Storage['upsertQuery']>;
  openQuery(_legacyUserId: string, networkId: string, target: string): ReturnType<Storage['upsertQuery']>;
  openQuery(...args: [string, string] | [string, string, string]) {
    return this.openQueryInternal(...resolveArgsWithValue(args));
  }

  closeBuffer(bufferId: string): BufferState;
  closeBuffer(_legacyUserId: string, bufferId: string): BufferState;
  closeBuffer(bufferIdOrLegacyUserId: string, maybeBufferId?: string) {
    return this.closeBufferInternal(resolveBufferId(bufferIdOrLegacyUserId, maybeBufferId));
  }

  markBufferRead(bufferId: string): ReturnType<Storage['getBuffer']>;
  markBufferRead(_legacyUserId: string, bufferId: string): ReturnType<Storage['getBuffer']>;
  markBufferRead(bufferIdOrLegacyUserId: string, maybeBufferId?: string) {
    return this.markBufferReadInternal(resolveBufferId(bufferIdOrLegacyUserId, maybeBufferId));
  }

  history(bufferId: string, limit: number): ReturnType<Storage['listMessages']>;
  history(_legacyUserId: string, bufferId: string, limit: number): ReturnType<Storage['listMessages']>;
  history(...args: [string, number] | [string, string, number]) {
    return this.historyInternal(...resolveBufferArgsWithLimit(args));
  }

  saveNetwork(data: unknown): SaveNetworkResult;
  saveNetwork(_legacyUserId: string, data: unknown): SaveNetworkResult;
  saveNetwork(...args: [unknown] | [string, unknown]) {
    return this.saveNetworkInternal(resolveNetworkInput(args));
  }

  sendMessage(networkId: string, target: string, body: string, kind?: 'message' | 'action'): void;
  sendMessage(_legacyUserId: string, networkId: string, target: string, body: string, kind?: 'message' | 'action'): void;
  sendMessage(...args: [string, string, string, ('message' | 'action' | undefined)?] | [string, string, string, string, ('message' | 'action' | undefined)?]) {
    return this.sendMessageInternal(...resolveMessageArgs(args));
  }

  sendRaw(networkId: string, raw: string): void;
  sendRaw(_legacyUserId: string, networkId: string, raw: string): void;
  sendRaw(...args: [string, string] | [string, string, string]) {
    return this.sendRawInternal(...resolveArgsWithValue(args));
  }

  deleteNetwork(networkId: string): string[];
  deleteNetwork(_legacyUserId: string, networkId: string): string[];
  deleteNetwork(...args: [string] | [string, string]) {
    return this.deleteNetworkInternal(resolveNetworkIdFromArgs(args));
  }

  private openQueryInternal(networkId: string, target: string) {
    this.getRequiredNetwork(networkId);
    return this.store.upsertQuery(networkId, normalizeQueryTarget(target));
  }

  private joinInternal(networkId: string, channel: string) {
    this.getRequiredNetwork(networkId);
    const normalizedChannel = normalizeChannelTarget(channel);
    const buffer = this.store.upsertBuffer({
      networkId,
      kind: 'channel',
      target: normalizedChannel,
    });
    this.ensureConnection(networkId).join(normalizedChannel);
    return buffer;
  }

  private closeBufferInternal(bufferId: string) {
    const buffer = this.getRequiredBuffer(bufferId);
    if (buffer.kind !== 'query') {
      throw badRequest('Only private message buffers can be closed');
    }
    return this.store.removeBuffer(bufferId) ?? buffer;
  }

  private markBufferReadInternal(bufferId: string) {
    const buffer = this.getRequiredBuffer(bufferId);
    if (buffer.unread === 0) {
      return buffer;
    }
    this.store.markBufferRead(bufferId);
    const updatedBuffer = this.getRequiredBuffer(bufferId);
    this.send({ type: 'buffer.upsert', buffer: updatedBuffer });
    return updatedBuffer;
  }

  private historyInternal(bufferId: string, limit: number) {
    const buffer = this.getRequiredBuffer(bufferId);
    return this.store.listMessages(buffer.networkId, buffer.target, limit);
  }

  private saveNetworkInternal(data: unknown) {
    const input = data as NetworkInput;
    if (input.id) {
      this.getRequiredNetwork(input.id);
    }
    const network = this.store.upsertNetwork(input);
    const updatedProfiles = [network, ...this.syncTemplateInstances(network, input)];
    let serverBuffer = network.managerHidden ? this.store.getServerBuffer(network.id) : null;
    for (const updatedProfile of updatedProfiles) {
      const runtimeProfile = this.store.getRuntimeNetwork(updatedProfile.id);
      if (runtimeProfile) {
        this.connections.get(updatedProfile.id)?.updateProfile(runtimeProfile);
      }
      this.send({ type: 'network.upsert', network: updatedProfile });
      if (updatedProfile.managerHidden) {
        const nextServerBuffer = this.store.getServerBuffer(updatedProfile.id);
        if (nextServerBuffer) {
          this.send({ type: 'buffer.upsert', buffer: nextServerBuffer });
          if (updatedProfile.id === network.id) {
            serverBuffer = nextServerBuffer;
          }
        }
      }
    }
    return { network, serverBuffer };
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

  private getRequiredBuffer(bufferId: string) {
    const buffer = this.store.getBuffer(bufferId);
    if (!buffer) {
      throw notFound('Buffer not found');
    }
    return buffer;
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

const resolveArgsWithValue = (args: ArrayLike<unknown>) =>
  args.length === 3
    ? [String(args[1]), String(args[2])] as const
    : [String(args[0]), String(args[1])] as const;

const resolveBufferId = (bufferIdOrLegacyUserId: string, maybeBufferId?: string) =>
  maybeBufferId ?? bufferIdOrLegacyUserId;

const resolveBufferArgsWithLimit = (args: ArrayLike<unknown>) =>
  args.length === 3
    ? [String(args[1]), Number(args[2])] as const
    : [String(args[0]), Number(args[1])] as const;

const resolveNetworkInput = (args: ArrayLike<unknown>) =>
  args.length === 2 ? args[1] : args[0];

const resolveNetworkIdFromArgs = (args: ArrayLike<unknown>) =>
  args.length === 2 ? String(args[1]) : String(args[0]);

const resolveMessageArgs = (args: ArrayLike<unknown>) => {
  if (args.length >= 5) {
    return [String(args[1]), String(args[2]), String(args[3]), args[4] as 'message' | 'action'] as const;
  }
  return [String(args[0]), String(args[1]), String(args[2]), (args[3] as 'message' | 'action' | undefined) ?? 'message'] as const;
};
