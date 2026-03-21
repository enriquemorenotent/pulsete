import { useEffect, useRef, useState } from 'react';
import type { ServerMessage } from '../../shared/protocol.js';
import type { Action } from './app-types.js';
import { connectSocket, type SocketHandle } from './client.js';
import { gatewayReconnectMessage, getGatewayReconnectDelayMs } from './gateway.js';

type MutableRef<T> = { current: T };

type UseGatewayConnectionParams = {
  dispatch: (action: Action) => void;
  socketRef: MutableRef<SocketHandle | null>;
};

type GatewaySocketCallbackParams = {
  getSocket: () => SocketHandle;
  socketRef: MutableRef<SocketHandle | null>;
  isClosedByClient: () => boolean;
  dispatch: (action: Action) => void;
  reconnectAttemptRef: MutableRef<number>;
  reconnectTimerRef: MutableRef<number | null>;
  setSocketGeneration: (updater: (value: number) => number) => void;
};

export function useGatewayConnection(params: UseGatewayConnectionParams) {
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const [socketGeneration, setSocketGeneration] = useState(0);

  useEffect(() => {
    if (params.socketRef.current) {
      return;
    }
    params.dispatch({ type: 'gateway-connecting' });
    let closedByClient = false;
    let socket: SocketHandle;
    socket = connectSocket(createGatewaySocketCallbacks({
      getSocket: () => socket,
      socketRef: params.socketRef,
      isClosedByClient: () => closedByClient,
      dispatch: params.dispatch,
      reconnectAttemptRef,
      reconnectTimerRef,
      setSocketGeneration,
    }));
    params.socketRef.current = socket;
    return () => {
      closedByClient = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (params.socketRef.current === socket) {
        params.socketRef.current = null;
      }
      socket.close();
    };
  }, [params.dispatch, params.socketRef, socketGeneration]);
}

export const createGatewaySocketCallbacks = ({
  getSocket,
  socketRef,
  isClosedByClient,
  dispatch,
  reconnectAttemptRef,
  reconnectTimerRef,
  setSocketGeneration,
}: GatewaySocketCallbackParams) => ({
  onMessage(message: ServerMessage) {
    if (isClosedByClient() || socketRef.current !== getSocket()) {
      return;
    }
    if (message.type === 'state.ready') {
      reconnectAttemptRef.current = 0;
    }
    handleServerMessage(message, dispatch);
  },
  onOpen() {
    if (isClosedByClient() || socketRef.current !== getSocket()) {
      return;
    }
    dispatch({ type: 'gateway-connecting' });
  },
  onClose() {
    if (isClosedByClient() || socketRef.current !== getSocket()) {
      return;
    }
    socketRef.current = null;
    dispatch({ type: 'gateway-disconnected' });
    dispatch({ type: 'set-banner', banner: { kind: 'error', message: gatewayReconnectMessage } });
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
    }
    const delay = getGatewayReconnectDelayMs(reconnectAttemptRef.current);
    reconnectAttemptRef.current += 1;
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      setSocketGeneration((value) => value + 1);
    }, delay);
  },
});

function handleServerMessage(message: ServerMessage, dispatch: (action: Action) => void) {
  if (message.type === 'state.ready') {
    dispatch({ type: 'gateway-connected' });
    return void dispatch({ type: 'snapshot', snapshot: message.snapshot });
  }
  if (message.type === 'network.state') {
    return void dispatch({
      type: 'network-state',
      networkId: message.networkId,
      phase: message.phase,
      serverName: message.serverName,
      nick: message.nick,
    });
  }
  if (message.type === 'network.upsert') return void dispatch({ type: 'upsert-network', network: message.network });
  if (message.type === 'network.remove') return void dispatch({ type: 'remove-network', networkId: message.networkId });
  if (message.type === 'friend.upsert') return void dispatch({ type: 'upsert-friend', friend: message.friend });
  if (message.type === 'friend.remove') return void dispatch({ type: 'remove-friend', friendId: message.friendId });
  if (message.type === 'friend.presence') {
    return void dispatch({ type: 'friend-presence', friendId: message.friendId, online: message.online });
  }
  if (message.type === 'buffer.upsert') return void dispatch({ type: 'upsert-buffer', buffer: message.buffer });
  if (message.type === 'buffer.remove') return void dispatch({ type: 'remove-buffer', networkId: message.networkId, bufferId: message.bufferId });
  if (message.type === 'channel.snapshot') return void dispatch({ type: 'upsert-channel', channel: message.channel });
  if (message.type === 'channel.pending') {
    return void dispatch({ type: 'add-pending-channel', pendingChannel: message.pendingChannel });
  }
  if (message.type === 'channel.pending.remove') {
    return void dispatch({ type: 'remove-pending-channel', networkId: message.networkId, channel: message.channel });
  }
  if (message.type === 'channel.list.started') {
    return void dispatch({ type: 'channel-list-started', networkId: message.networkId, requestId: message.requestId });
  }
  if (message.type === 'channel.list.entry') {
    return void dispatch({
      type: 'channel-list-entry',
      networkId: message.networkId,
      requestId: message.requestId,
      entry: message.entry,
    });
  }
  if (message.type === 'channel.list.completed') {
    return void dispatch({ type: 'channel-list-completed', networkId: message.networkId, requestId: message.requestId });
  }
  if (message.type === 'channel.list.failed') {
    return void dispatch({
      type: 'channel-list-failed',
      networkId: message.networkId,
      requestId: message.requestId,
      message: message.message,
    });
  }
  if (message.type === 'message.append') return void dispatch({ type: 'append-message', message: message.message });
  if (message.type === 'presence.update') {
    return void dispatch({
      type: 'update-presence',
      networkId: message.networkId,
      channel: message.channel,
      users: message.users,
    });
  }
  if (message.type === 'notice' || message.type === 'error') {
    dispatch({ type: 'set-banner', banner: { kind: message.type, message: message.message } });
  }
}
