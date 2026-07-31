import { useEffect } from 'react';
import type { ServerMessage } from '../../shared/protocol-messages.js';
import {
  selectBanner,
  selectBuffers,
  selectNetworkManagerState,
  selectNetworks,
  selectPhase,
  selectVisibleNetworks,
  selectWorkspaceNetworkCount,
  selectDrafts,
  selectBrowserStorageImportPending,
} from './app-selectors.js';
import { useAppDispatch, useAppSelector } from './app-store.js';
import type { AppTransientUiState } from './useAppUiState.js';
import { gatewayReconnectMessage } from './gateway.js';
import { useGatewayConnection } from './useGatewayConnection.js';
import type { ComposerStoreApi } from './composer-store.js';
import { transcriptScrollSnapshots } from './transcript/scroll-snapshot-store.js';
import {
  useAutoOpenNetworkManager,
  useManagedNetworkSelection,
} from './useNetworkManagerLifecycle.js';
import type { ClientSocketInstrumentation } from './client-socket.js';
import type { AiAssistantStoreApi } from './ai-assistant-store.js';
import { useConversationNavigationHistory } from './conversation-navigation-history.js';
import type { AppActions } from './useAppActions.js';
import { importCurrentBrowserStorage } from './legacy-browser-storage-import.js';
import type { ApplyServerMessages } from './app-actions-types.js';

type AppEffectsProps = {
  applySocketMessage: (message: ServerMessage) => void;
  applyServerMessages: ApplyServerMessages;
  assistantStore: Pick<AiAssistantStoreApi, 'pruneThreads'>;
  composer: Pick<ComposerStoreApi, 'applyServerDrafts' | 'pruneContexts' | 'subscribeDrafts'>;
  saveDraft: AppActions['saveDraft'];
  socketInstrumentation: ClientSocketInstrumentation;
  ui: Pick<
    AppTransientUiState,
    | 'didAutoOpenManagerRef'
    | 'socketRef'
  >;
};

export function AppEffects(props: AppEffectsProps) {
  const dispatch = useAppDispatch();
  const banner = useAppSelector(selectBanner);
  const buffers = useAppSelector(selectBuffers);
  const workspaceNetworkCount = useAppSelector(selectWorkspaceNetworkCount);
  const networkManager = useAppSelector(selectNetworkManagerState);
  const networks = useAppSelector(selectNetworks);
  const phase = useAppSelector(selectPhase);
  const visibleNetworks = useAppSelector(selectVisibleNetworks);
  const drafts = useAppSelector(selectDrafts);
  const browserStorageImportPending = useAppSelector(selectBrowserStorageImportPending);

  useConversationNavigationHistory();

  useAutoOpenNetworkManager({
    phase,
    networkManagerMode: networkManager.mode,
    workspaceNetworkCount,
    didAutoOpenManagerRef: props.ui.didAutoOpenManagerRef,
    dispatch,
  });

  useManagedNetworkSelection({
    phase,
    networks,
    visibleNetworks,
    managedNetworkId: networkManager.managedNetworkId,
    dispatch,
  });

  useEffect(() => {
    if (!banner || banner.message === gatewayReconnectMessage) {
      return;
    }
    const timer = window.setTimeout(
      () => dispatch({ type: 'set-banner', banner: null }),
      4200,
    );
    return () => window.clearTimeout(timer);
  }, [banner, dispatch]);

  useGatewayConnection({
    applySocketMessage: props.applySocketMessage,
    dispatch,
    instrumentation: props.socketInstrumentation,
    socketRef: props.ui.socketRef,
  });

  useEffect(() => {
    const activeBufferIds = buffers.map((buffer) => buffer.id);
    props.assistantStore.pruneThreads(activeBufferIds);
    props.composer.pruneContexts(activeBufferIds);
    transcriptScrollSnapshots.prune(activeBufferIds);
  }, [buffers, props.assistantStore, props.composer]);

  useEffect(() => {
    props.composer.applyServerDrafts(drafts);
  }, [buffers, drafts, props.composer]);

  useEffect(() => {
    const timers = new Map<string, number>();
    const latest = new Map<string, string>();
    let active = true;
    const save = (bufferId: string) => {
      const body = latest.get(bufferId);
      if (body === undefined) {
        return;
      }
      latest.delete(bufferId);
      timers.delete(bufferId);
      void props.saveDraft(bufferId, body).then((saved) => {
        if (!active || saved || latest.has(bufferId)) {
          return;
        }
        latest.set(bufferId, body);
        timers.set(bufferId, window.setTimeout(() => save(bufferId), 2_000));
      });
    };
    const unsubscribe = props.composer.subscribeDrafts((bufferId, body) => {
      const existing = timers.get(bufferId);
      if (existing !== undefined) {
        window.clearTimeout(existing);
      }
      latest.set(bufferId, body);
      if (!body) {
        save(bufferId);
        return;
      }
      timers.set(bufferId, window.setTimeout(() => save(bufferId), 250));
    });
    const flush = () => {
      for (const bufferId of [...latest.keys()]) {
        save(bufferId);
      }
    };
    window.addEventListener('blur', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener('blur', flush);
      window.removeEventListener('pagehide', flush);
      for (const timer of timers.values()) {
        window.clearTimeout(timer);
      }
      flush();
    };
  }, [props.composer, props.saveDraft]);

  useEffect(() => {
    if (phase !== 'ready' || !browserStorageImportPending) {
      return;
    }
    let cancelled = false;
    let retryTimer: number | null = null;
    const runImport = async () => {
      try {
        await importCurrentBrowserStorage(buffers, props.applyServerMessages);
      } catch {
        if (cancelled) {
          return;
        }
        dispatch({
          type: 'set-banner',
          banner: { kind: 'error', message: 'Could not migrate browser preferences; retrying.' },
        });
        retryTimer = window.setTimeout(() => void runImport(), 2_000);
      }
    };
    void runImport();
    return () => {
      cancelled = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [
    browserStorageImportPending,
    buffers,
    dispatch,
    phase,
    props.applyServerMessages,
  ]);

  return null;
}
