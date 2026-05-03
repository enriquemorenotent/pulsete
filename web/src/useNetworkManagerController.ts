import { useCallback, useMemo } from 'react';
import type { NetworkProfile, NetworkRuntimeState } from '../../shared/protocol-chat.js';
import type { Action, State } from './app-types.js';
import type { DesktopShellModel } from './desktop-shell-model.js';
import { buildManagedRuntime } from './network-manager-runtime.js';
import { openExistingNetworkEditor, openNewNetworkEditor } from './network-editor-actions.js';
import type { NetworkManagerActionSet } from './useAppActions.js';

type NetworkManagerControllerParams = {
  actions: NetworkManagerActionSet;
  dispatch: (action: Action) => void;
  managedRuntime: ReturnType<typeof buildManagedRuntime>;
  managedRuntimes: Record<string, NetworkRuntimeState | null>;
  networkManager: State['transient']['networkManager'];
  visibleManagedNetwork: NetworkProfile | null;
  visibleNetworks: NetworkProfile[];
};

const createOpenNewNetworkEditorDialog = (dispatch: (action: Action) => void) => () =>
  openNewNetworkEditor({ dispatch });

export function useNetworkManagerController({
  actions,
  dispatch,
  managedRuntime,
  managedRuntimes,
  networkManager,
  visibleManagedNetwork,
  visibleNetworks,
}: NetworkManagerControllerParams): DesktopShellModel['networkManager'] {
  const openNewNetworkEditorDialog = useCallback(createOpenNewNetworkEditorDialog(dispatch), [dispatch]);

  const openExistingNetworkEditorDialog = useCallback(
    (network: NetworkProfile) => openExistingNetworkEditor(network, { dispatch }),
    [dispatch]
  );

  const duplicateNetwork = useCallback(async (network: NetworkProfile) => {
    const duplicate = await actions.duplicateNetwork(network);
    if (duplicate) {
      dispatch({ type: 'set-managed-network', networkId: duplicate.id });
    }
  }, [actions.duplicateNetwork, dispatch]);

  const connectNetwork = useCallback(async (network: NetworkProfile) => {
    if (await actions.connectNetwork(network)) {
      dispatch({ type: 'close-network-manager' });
    }
  }, [actions.connectNetwork, dispatch]);

  return useMemo(() => ({
    open: networkManager.mode === 'manager',
    networks: visibleNetworks,
    selected: visibleManagedNetwork,
    runtime: managedRuntime,
    runtimes: managedRuntimes,
    showFavoritesOnly: networkManager.showFavoritesOnly,
    onSelect: (networkId) => dispatch({ type: 'set-managed-network', networkId }),
    onToggleFavorites: () =>
      dispatch({
        type: 'set-network-manager-favorites',
        value: !networkManager.showFavoritesOnly,
      }),
    onClose: () => dispatch({ type: 'close-network-manager' }),
    onAdd: openNewNetworkEditorDialog,
    onEdit: () => visibleManagedNetwork && openExistingNetworkEditorDialog(visibleManagedNetwork),
    onDuplicate: () => visibleManagedNetwork && duplicateNetwork(visibleManagedNetwork),
    onRemove: (network) => {
      void actions.deleteNetwork(network.id);
    },
    onConnect: () => visibleManagedNetwork && connectNetwork(visibleManagedNetwork),
    onFavorite: () =>
      visibleManagedNetwork
      && actions.saveFavorite(visibleManagedNetwork, !visibleManagedNetwork.favorite),
  }), [
    actions.deleteNetwork,
    actions.saveFavorite,
    connectNetwork,
    dispatch,
    duplicateNetwork,
    managedRuntime,
    managedRuntimes,
    networkManager.mode,
    networkManager.showFavoritesOnly,
    openExistingNetworkEditorDialog,
    openNewNetworkEditorDialog,
    visibleManagedNetwork,
    visibleNetworks,
  ]);
}
