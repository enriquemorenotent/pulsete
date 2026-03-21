import { useEffect, useRef, useState } from 'react';
import type { NetworkProfile, ServerMessage } from '../../shared/protocol.js';
import type { Action, State } from './app-types.js';
import { api, connectSocket, type SocketHandle } from './client.js';
import { gatewayReconnectMessage, getGatewayReconnectDelayMs } from './gateway.js';
import { resolveManagedNetworkId } from './network-manager-state.js';
import type { WorkspaceView } from './workspace.js';

type MutableRef<T> = { current: T };
type ScrollMetrics = Pick<HTMLDivElement, 'clientHeight' | 'scrollHeight' | 'scrollTop'>;
type ScrollContainer = Pick<
  HTMLDivElement,
  'addEventListener' | 'clientHeight' | 'firstElementChild' | 'removeEventListener' | 'scrollHeight' | 'scrollTop'
>;
type ResizeObserverLike = {
  observe: (target: Element) => void;
  disconnect: () => void;
};
type ResizeObserverFactory = ((callback: () => void) => ResizeObserverLike) | null;

const stickyScrollThresholdPx = 24;

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
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const historyRequestRef = useRef(0);
  const stickToBottomRef = useRef(true);
  const [socketGeneration, setSocketGeneration] = useState(0);

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
    if (!params.state.banner || params.state.banner.message === gatewayReconnectMessage) {
      return;
    }
    const timer = window.setTimeout(() => params.dispatch({ type: 'set-banner', banner: null }), 4200);
    return () => window.clearTimeout(timer);
  }, [params.state.banner]);

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
  }, [params.socketRef, socketGeneration]);

  useEffect(() => {
    const unread = params.workspace.selectedBuffer?.unread ?? 0;
    if (params.workspace.selectedBuffer && unread > 0) {
      api.markBufferRead(params.workspace.selectedBuffer.id).catch(() => undefined);
    }
  }, [params.workspace.selectedBuffer?.id, params.workspace.selectedBuffer?.unread]);

  useEffect(() => {
    historyRequestRef.current += 1;
    const requestId = historyRequestRef.current;
    let active = true;
    void loadSelectedBufferHistory({
      bufferId: params.workspace.selectedBuffer?.id ?? null,
      gatewayStatus: params.state.gatewayStatus,
      dispatch: params.dispatch,
      loadHistory: api.loadHistory,
      isCurrentRequest: () => active && historyRequestRef.current === requestId,
    });
    return () => {
      active = false;
    };
  }, [params.state.gatewayStatus, params.workspace.selectedBuffer?.id]);

  useEffect(() => {
    const node = params.scrollRef.current;
    if (!node) {
      return;
    }
    stickToBottomRef.current = true;
    scrollNodeToBottom(node);
    return bindStickyScrollTracking({ node, stickToBottomRef, createResizeObserver: createResizeObserverFactory() });
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

export const scrollNodeToBottom = (node: Pick<ScrollContainer, 'scrollHeight' | 'scrollTop'>) => {
  node.scrollTop = node.scrollHeight;
};

export const isScrollNearBottom = (node: ScrollMetrics) =>
  node.scrollHeight - node.scrollTop - node.clientHeight <= stickyScrollThresholdPx;

export const createResizeObserverFactory = (): ResizeObserverFactory =>
  typeof ResizeObserver === 'undefined'
    ? null
    : (callback) =>
        new ResizeObserver(() => {
          callback();
        });

export function bindStickyScrollTracking(params: {
  node: ScrollContainer;
  stickToBottomRef: MutableRef<boolean>;
  createResizeObserver: ResizeObserverFactory;
}) {
  const updateStickiness = () => {
    params.stickToBottomRef.current = isScrollNearBottom(params.node);
  };

  updateStickiness();
  params.node.addEventListener('scroll', updateStickiness, { passive: true });

  const content = params.node.firstElementChild;
  const resizeObserver =
    content && params.createResizeObserver
      ? params.createResizeObserver(() => {
          if (!params.stickToBottomRef.current) {
            return;
          }
          scrollNodeToBottom(params.node);
          params.stickToBottomRef.current = true;
        })
      : null;

  if (content && resizeObserver) {
    resizeObserver.observe(content);
  }

  return () => {
    params.node.removeEventListener('scroll', updateStickiness);
    resizeObserver?.disconnect();
  };
}

type GatewaySocketCallbackParams = {
  getSocket: () => SocketHandle;
  socketRef: MutableRef<SocketHandle | null>;
  isClosedByClient: () => boolean;
  dispatch: (action: Action) => void;
  reconnectAttemptRef: MutableRef<number>;
  reconnectTimerRef: MutableRef<number | null>;
  setSocketGeneration: (updater: (value: number) => number) => void;
};

type LoadSelectedBufferHistoryParams = {
  bufferId: string | null;
  gatewayStatus: State['gatewayStatus'];
  dispatch: (action: Action) => void;
  loadHistory: typeof api.loadHistory;
  isCurrentRequest: () => boolean;
};

export async function loadSelectedBufferHistory({
  bufferId,
  gatewayStatus,
  dispatch,
  loadHistory,
  isCurrentRequest,
}: LoadSelectedBufferHistoryParams) {
  if (!bufferId || gatewayStatus !== 'connected') {
    dispatch({ type: 'set-history-loading', value: false });
    return;
  }
  dispatch({ type: 'set-history-loading', value: true });
  try {
    const payload = await loadHistory(bufferId);
    if (!isCurrentRequest()) {
      return;
    }
    dispatch({ type: 'append-messages', messages: payload.messages });
    dispatch({ type: 'set-history-loading', value: false });
  } catch {
    if (!isCurrentRequest()) {
      return;
    }
    dispatch({ type: 'set-history-loading', value: false });
    dispatch({ type: 'set-banner', banner: { kind: 'error', message: 'Failed to load history' } });
  }
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
    return void dispatch({ type: 'update-presence', networkId: message.networkId, channel: message.channel, users: message.users });
  }
  if (message.type === 'notice' || message.type === 'error') {
    dispatch({ type: 'set-banner', banner: { kind: message.type, message: message.message } });
  }
}
