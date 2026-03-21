import type { NetworkProfile } from '../../shared/protocol.js';
import type { Action, State } from './app-types.js';
import type { DesktopShellProps } from './DesktopShell.js';
import { openExistingNetworkEditor, openNewNetworkEditor } from './network-editor-actions.js';
import type { useAppActions } from './useAppActions.js';
import type { useAppDerivedState } from './useAppDerivedState.js';

type NetworkManagerControllerParams = {
  actions: ReturnType<typeof useAppActions>;
  derived: ReturnType<typeof useAppDerivedState>;
  dispatch: (action: Action) => void;
  state: State;
};

const createOpenNewNetworkEditorDialog = (dispatch: (action: Action) => void) => () =>
  openNewNetworkEditor({ dispatch });

export function useNetworkManagerController({
  actions,
  derived,
  dispatch,
  state,
}: NetworkManagerControllerParams): DesktopShellProps['networkManager'] {
  const openNewNetworkEditorDialog = createOpenNewNetworkEditorDialog(dispatch);
  const networkManager = state.transient.networkManager;

  const openExistingNetworkEditorDialog = (network: NetworkProfile) =>
    openExistingNetworkEditor(network, { dispatch });

  const duplicateNetwork = async (network: NetworkProfile) => {
    const duplicate = await actions.duplicateNetwork(network);
    if (duplicate) {
      dispatch({ type: 'set-managed-network', networkId: duplicate.id });
    }
  };

  const connectNetwork = async (network: NetworkProfile) => {
    if (await actions.connectNetwork(network)) {
      dispatch({ type: 'close-network-manager' });
    }
  };

  return {
    open: networkManager.mode === 'manager',
    networks: derived.visibleNetworks,
    selected: derived.visibleManagedNetwork,
    runtime: derived.managedRuntime,
    showFavoritesOnly: networkManager.showFavoritesOnly,
    hiddenManagedNetworkName: derived.hiddenManagedNetworkName,
    onSelect: (networkId) => dispatch({ type: 'set-managed-network', networkId }),
    onToggleFavorites: () =>
      dispatch({
        type: 'set-network-manager-favorites',
        value: !networkManager.showFavoritesOnly,
      }),
    onClose: () => dispatch({ type: 'close-network-manager' }),
    onAdd: openNewNetworkEditorDialog,
    onEdit: () => derived.visibleManagedNetwork && openExistingNetworkEditorDialog(derived.visibleManagedNetwork),
    onDuplicate: () => derived.visibleManagedNetwork && duplicateNetwork(derived.visibleManagedNetwork),
    onRemove: () => derived.visibleManagedNetwork && actions.deleteNetwork(derived.visibleManagedNetwork.id),
    onConnect: () => derived.visibleManagedNetwork && connectNetwork(derived.visibleManagedNetwork),
    onFavorite: () =>
      derived.visibleManagedNetwork
      && actions.saveFavorite(derived.visibleManagedNetwork, !derived.visibleManagedNetwork.favorite),
  };
}
