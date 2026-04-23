import { memo } from 'react';
import { NetworkEditorDialog } from './NetworkEditorDialog.js';
import { NetworkManagerDialog } from './NetworkManagerDialog.js';
import { PreferencesDialog } from './PreferencesDialog.js';
import {
  selectManagedNetworkModel,
  selectMutedNicks,
  selectNetworkManagerState,
  selectNetworks,
  selectVisibleNetworks,
} from './app-selectors.js';
import { useAppDispatch, useAppSelector } from './app-store.js';
import { useNetworkEditorController } from './useNetworkEditorController.js';
import { useNetworkManagerController } from './useNetworkManagerController.js';
import { usePreferencesController } from './usePreferencesController.js';
import type { AppActions } from './useAppActions.js';
import type { BackgroundDmAudioState } from './useBackgroundDmAudio.js';
import type { AppUiState } from './useAppUiState.js';

type PreferencesDialogContainerProps = {
  actions: AppActions;
  backgroundDmAudio: BackgroundDmAudioState;
  previewBackgroundDmAudio: BackgroundDmAudioState['setSound'];
  primeBackgroundDmAudio: () => void;
  ui: AppUiState;
};

export const PreferencesDialogContainer = memo(function PreferencesDialogContainer({
  actions,
  backgroundDmAudio,
  previewBackgroundDmAudio,
  primeBackgroundDmAudio,
  ui,
}: PreferencesDialogContainerProps) {
  const mutedNicks = useAppSelector(selectMutedNicks);
  const networks = useAppSelector(selectNetworks);
  const model = usePreferencesController({
    actions,
    backgroundDmAudio,
    mutedNicks,
    networks,
    primeBackgroundDmAudio,
    previewBackgroundDmAudio,
    ui,
  });
  return <PreferencesDialog {...model} />;
});

export const NetworkManagerDialogContainer = memo(function NetworkManagerDialogContainer({
  actions,
}: {
  actions: AppActions;
}) {
  const dispatch = useAppDispatch();
  const managedNetworkModel = useAppSelector(selectManagedNetworkModel);
  const networkManager = useAppSelector(selectNetworkManagerState);
  const visibleNetworks = useAppSelector(selectVisibleNetworks);
  const model = useNetworkManagerController({
    actions,
    dispatch,
    managedRuntime: managedNetworkModel.managedRuntime,
    managedRuntimes: managedNetworkModel.managedRuntimes,
    networkManager,
    visibleManagedNetwork: managedNetworkModel.visibleManagedNetwork,
    visibleNetworks,
  });

  return model.open ? (
    <NetworkManagerDialog
      networks={model.networks}
      selected={model.selected}
      runtime={model.runtime}
      runtimes={model.runtimes}
      showFavoritesOnly={model.showFavoritesOnly}
      onSelect={model.onSelect}
      onToggleFavorites={model.onToggleFavorites}
      onClose={model.onClose}
      onAdd={model.onAdd}
      onEdit={model.onEdit}
      onDuplicate={model.onDuplicate}
      onRemove={model.onRemove}
      onConnect={model.onConnect}
      onFavorite={model.onFavorite}
    />
  ) : null;
});

export const NetworkEditorDialogContainer = memo(function NetworkEditorDialogContainer({
  actions,
}: {
  actions: AppActions;
}) {
  const dispatch = useAppDispatch();
  const networkManager = useAppSelector(selectNetworkManagerState);
  const model = useNetworkEditorController({
    actions,
    dispatch,
    editor: networkManager.editor,
    mode: networkManager.mode,
  });

  return model.open ? (
    <NetworkEditorDialog
      form={model.form}
      activeTab={model.activeTab}
      onTabChange={model.onTabChange}
      onClose={model.onClose}
      onSubmit={model.onSubmit}
      onChange={model.onChange}
    />
  ) : null;
});
