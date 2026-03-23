import { useEffect, useRef, useState } from 'react';
import type { ServerMessage } from '../../shared/protocol.js';
import type { Action } from './app-types.js';
import { connectSocket, type SocketHandle } from './client.js';
import { gatewayReconnectMessage, getGatewayReconnectDelayMs } from './gateway.js';
import { dispatchInboundServerMessage } from './server-message-actions.js';

type MutableRef<T> = { current: T };

type UseGatewayConnectionParams = {
  applySocketMessage: (message: ServerMessage) => void;
  dispatch: (action: Action) => void;
  socketRef: MutableRef<SocketHandle | null>;
};

type GatewaySocketCallbackParams = {
  getSocket: () => SocketHandle;
  socketRef: MutableRef<SocketHandle | null>;
  isClosedByClient: () => boolean;
  applySocketMessage?: (message: ServerMessage) => void;
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
      applySocketMessage: params.applySocketMessage,
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
  }, [params.applySocketMessage, params.dispatch, params.socketRef, socketGeneration]);
}

export const createGatewaySocketCallbacks = ({
  getSocket,
  socketRef,
  isClosedByClient,
  applySocketMessage = (message) => dispatchInboundServerMessage(message, dispatch),
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
    applySocketMessage(message);
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
