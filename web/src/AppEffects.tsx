import { useEffect, useState } from 'react';
import { AutosaveQueue } from './autosave-queue.js';
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
import { useAppStore, useAppDispatch, useAppSelector } from './app-store.js';
import type { AppTransientUiState } from './useAppUiState.js';
import { useBannerDismissal } from './useBannerDismissal.js';
import { useGatewayConnection } from './useGatewayConnection.js';
import type { ComposerStoreApi } from './composer-store.js';
import { transcriptScrollSnapshots } from './transcript/scroll-snapshot-store.js';
import {
  useAutoOpenNetworkManager,
  useManagedNetworkSelection,
} from './useNetworkManagerLifecycle.js';
import type { AiAssistantStoreApi } from './ai-assistant-store.js';
import { useConversationNavigationHistory } from './conversation-navigation-history.js';
import type { AppActions } from './useAppActions.js';
import { importCurrentBrowserStorage } from './legacy-browser-storage-import.js';
import type { ApplyServerMessages } from './app-actions-types.js';

type AppEffectsProps = {
  applySocketMessage: (message: ServerMessage) => void;
  applyServerMessages: ApplyServerMessages;
  assistantStore: Pick<AiAssistantStoreApi, 'pruneThreads' | 'clearThread'>;
  composer: Pick<ComposerStoreApi, 'applyServerDrafts' | 'pruneContexts' | 'subscribeDrafts'>;
  saveDraft: AppActions['saveDraft'];
  ui: Pick<
    AppTransientUiState,
    | 'didAutoOpenManagerRef'
    | 'socketRef'
  >;
};

export function AppEffects(props: AppEffectsProps) {
  const dispatch = useAppDispatch();
  const appStore = useAppStore();
  useEffect(() => appStore.subscribeActions(({ action, state }) => {
    if (action.type !== 'remove-messages') return;
    const bufferId = action.bufferId ?? state.domain.buffers.find((buffer) => buffer.networkId === action.networkId && buffer.target === action.target && buffer.queryTargetAvailable !== false)?.id;
    if (bufferId && (state.domain.messages[bufferId]?.length ?? 0) === 0) props.assistantStore.clearThread(bufferId);
  }), [appStore, props.assistantStore]);
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

  useBannerDismissal(banner, dispatch);

  useGatewayConnection({
    applySocketMessage: props.applySocketMessage,
    dispatch,
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

  const [draftSaveQueue] = useState(() => new AutosaveQueue(props.saveDraft, { delayMs: value => value ? 250 : 0 }));
  useEffect(() => {
    draftSaveQueue.setSave(props.saveDraft);
  }, [draftSaveQueue, props.saveDraft]);

  useEffect(() => {
    draftSaveQueue.resume();
    const unsubscribe = props.composer.subscribeDrafts((bufferId, body) => {
      draftSaveQueue.enqueue(bufferId, body);
    });
    const flush = () => draftSaveQueue.flush();
    window.addEventListener('blur', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      unsubscribe();
      window.removeEventListener('blur', flush);
      window.removeEventListener('pagehide', flush);
      draftSaveQueue.stop();
    };
  }, [props.composer, draftSaveQueue]);

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
