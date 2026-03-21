import { useMemo } from 'react';
import type { State } from './app-types.js';
import { buildAppModel, type AppModel } from './app-model.js';

export function useAppDerivedState(state: State): AppModel {
  return useMemo(
    () =>
      buildAppModel({
        ...state.domain,
        channelListNetworkId: state.transient.channelList.networkId,
        managedNetworkId: state.transient.networkManager.managedNetworkId,
        selection: state.transient.selection,
        showFavoritesOnly: state.transient.networkManager.showFavoritesOnly,
      }),
    [
      state.domain,
      state.transient.channelList.networkId,
      state.transient.networkManager.managedNetworkId,
      state.transient.networkManager.showFavoritesOnly,
      state.transient.selection,
    ]
  );
}
