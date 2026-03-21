import { useCallback, useMemo } from 'react';
import type { NetworkProfile } from '../../shared/protocol.js';
import type { AppModel } from './app-model.js';
import type { Action, State } from './app-types.js';
import type { DesktopShellProps } from './DesktopShell.js';
import { openExistingNetworkEditor, openNewNetworkEditor } from './network-editor-actions.js';
import type { useAppActions } from './useAppActions.js';

type NetworkManagerControllerParams = {
  actions: ReturnType<typeof useAppActions>;
  dispatch: (action: Action) => void;
  model: AppModel;
  state: State;
};

const createOpenNewNetworkEditorDialog = (dispatch: (action: Action) => void) => () =>
  openNewNetworkEditor({ dispatch });

export function useNetworkManagerController({
  actions,
  dispatch,
  model,
  state,
}: NetworkManagerControllerParams): DesktopShellProps['networkManager'] {
  const openNewNetworkEditorDialog = useCallback(createOpenNewNetworkEditorDialog(dispatch), [dispatch]);
  const networkManager = state.transient.networkManager;

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
    networks: model.visibleNetworks,
    selected: model.visibleManagedNetwork,
    runtime: model.managedRuntime,
    showFavoritesOnly: networkManager.showFavoritesOnly,
    hiddenManagedNetworkName: model.hiddenManagedNetworkName,
    onSelect: (networkId) => dispatch({ type: 'set-managed-network', networkId }),
    onToggleFavorites: () =>
      dispatch({
        type: 'set-network-manager-favorites',
        value: !networkManager.showFavoritesOnly,
      }),
    onClose: () => dispatch({ type: 'close-network-manager' }),
    onAdd: openNewNetworkEditorDialog,
    onEdit: () => model.visibleManagedNetwork && openExistingNetworkEditorDialog(model.visibleManagedNetwork),
    onDuplicate: () => model.visibleManagedNetwork && duplicateNetwork(model.visibleManagedNetwork),
    onRemove: () => model.visibleManagedNetwork && actions.deleteNetwork(model.visibleManagedNetwork.id),
    onConnect: () => model.visibleManagedNetwork && connectNetwork(model.visibleManagedNetwork),
    onFavorite: () =>
      model.visibleManagedNetwork
      && actions.saveFavorite(model.visibleManagedNetwork, !model.visibleManagedNetwork.favorite),
  }), [
    actions.deleteNetwork,
    actions.saveFavorite,
    connectNetwork,
    dispatch,
    duplicateNetwork,
    model.hiddenManagedNetworkName,
    model.managedRuntime,
    model.visibleManagedNetwork,
    model.visibleNetworks,
    networkManager.mode,
    networkManager.showFavoritesOnly,
    openExistingNetworkEditorDialog,
    openNewNetworkEditorDialog,
  ]);
}
