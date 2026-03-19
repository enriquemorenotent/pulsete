import { useEffect } from 'react';
import type { NetworkProfile, ServerMessage } from '../../shared/protocol.js';
import type { Action, State } from './app-types.js';
import { api, connectSocket, type SocketHandle } from './client.js';
import { resolveManagedNetworkId } from './network-manager-state.js';
import type { WorkspaceView } from './workspace.js';

type MutableRef<T> = { current: T };

type LifecycleParams = {
  state: State;
  workspace: WorkspaceView;
  visibleNetworks: NetworkProfile[];
  managedNetworkId: string | null;
  dispatch: (action: Action) => void;
  setShowNetworkManager: (value: boolean) => void;
  setManagedNetworkId: (value: string | null) => void;
  socketRef: MutableRef<SocketHandle | null>;
  scrollRef: MutableRef<HTMLDivElement | null>;
  didAutoOpenManagerRef: MutableRef<boolean>;
};

export function useAppLifecycle(params: LifecycleParams) {
  useEffect(() => {
    let alive = true;
    api
      .snapshot()
      .then((snapshot) => alive && params.dispatch({ type: 'snapshot-loaded', snapshot }))
      .catch((error) => {
        if (alive) {
          params.dispatch({
            type: 'set-banner',
            banner: { kind: 'error', message: error instanceof Error ? error.message : 'Failed to load snapshot' },
          });
          params.dispatch({ type: 'load-failed' });
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (params.state.phase !== 'ready') {
      params.didAutoOpenManagerRef.current = false;
      params.setShowNetworkManager(false);
      return;
    }
    if (params.didAutoOpenManagerRef.current) {
      return;
    }
    params.didAutoOpenManagerRef.current = true;
    params.setShowNetworkManager(params.workspace.connectionInstances.length === 0);
  }, [params.state.phase, params.workspace.connectionInstances.length]);

  useEffect(() => {
    if (!params.state.banner) {
      return;
    }
    const timer = window.setTimeout(() => params.dispatch({ type: 'set-banner', banner: null }), 4200);
    return () => window.clearTimeout(timer);
  }, [params.state.banner]);

  useEffect(() => {
    if (params.state.phase !== 'ready' || params.socketRef.current) {
      return;
    }
    let closedByClient = false;
    const socket = connectSocket((message) => handleServerMessage(message, params.dispatch), () => {
      if (!closedByClient) {
        params.dispatch({ type: 'set-banner', banner: { kind: 'notice', message: 'Disconnected from gateway' } });
      }
    });
    params.socketRef.current = socket;
    return () => {
      closedByClient = true;
      socket.close();
      params.socketRef.current = null;
    };
  }, [params.state.phase]);

  useEffect(() => {
    const unread = params.workspace.selectedBuffer?.unread ?? 0;
    if (params.workspace.selectedBuffer && unread > 0) {
      api.markBufferRead(params.workspace.selectedBuffer.id).catch(() => undefined);
    }
  }, [params.workspace.selectedBuffer?.id, params.workspace.selectedBuffer?.unread]);

  useEffect(() => {
    if (!params.workspace.selectedBuffer) {
      return;
    }
    let active = true;
    params.dispatch({ type: 'set-history-loading', value: true });
    api
      .loadHistory(params.workspace.selectedBuffer.id)
      .then((payload) => active && params.dispatch({ type: 'append-messages', messages: payload.messages }))
      .finally(() => active && params.dispatch({ type: 'set-history-loading', value: false }));
    return () => {
      active = false;
    };
  }, [params.workspace.selectedBuffer?.id]);

  useEffect(() => {
    const node = params.scrollRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [params.state.messages.length, params.workspace.selectedBuffer?.id]);

  useEffect(() => {
    const nextManagedNetworkId = resolveManagedNetworkId({
      phase: params.state.phase,
      managerNetworks: params.state.networks.filter((network) => !network.managerHidden),
      visibleNetworks: params.visibleNetworks,
      managedNetworkId: params.managedNetworkId,
    });
    if (nextManagedNetworkId !== params.managedNetworkId) {
      params.setManagedNetworkId(nextManagedNetworkId);
    }
  }, [params.managedNetworkId, params.state.networks, params.state.phase, params.visibleNetworks]);
}

function handleServerMessage(message: ServerMessage, dispatch: (action: Action) => void) {
  if (message.type === 'state.ready') return void dispatch({ type: 'snapshot', snapshot: message.snapshot });
  if (message.type === 'network.state') {
    return void dispatch({
      type: 'network-state',
      networkId: message.networkId,
      connected: message.connected,
      serverName: message.serverName,
      nick: message.nick,
    });
  }
  if (message.type === 'network.upsert') return void dispatch({ type: 'upsert-network', network: message.network });
  if (message.type === 'network.remove') return void dispatch({ type: 'remove-network', networkId: message.networkId });
  if (message.type === 'buffer.upsert') return void dispatch({ type: 'upsert-buffer', buffer: message.buffer });
  if (message.type === 'buffer.remove') return void dispatch({ type: 'remove-buffer', networkId: message.networkId, bufferId: message.bufferId });
  if (message.type === 'channel.snapshot') return void dispatch({ type: 'upsert-channel', channel: message.channel });
  if (message.type === 'message.append') return void dispatch({ type: 'append-message', message: message.message });
  if (message.type === 'presence.update') {
    return void dispatch({ type: 'update-presence', networkId: message.networkId, channel: message.channel, users: message.users });
  }
  if (message.type === 'notice' || message.type === 'error') {
    dispatch({ type: 'set-banner', banner: { kind: message.type, message: message.message } });
  }
}
