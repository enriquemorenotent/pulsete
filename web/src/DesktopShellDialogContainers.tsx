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
import type { ContactNotificationsController } from './contact-notifications/controller.js';
import type { MediaVisibilityPolicy, MediaVisibilitySettingsController } from './media-visibility-settings.js';
import type { UserAvatarSettingsController } from './user-avatars/settings.js';
import type { AppUiState } from './useAppUiState.js';

type PreferencesDialogContainerProps = {
  actions: AppActions;
  contactNotifications: ContactNotificationsController;
  mediaVisibilitySettings: MediaVisibilitySettingsController;
  userAvatarSettings: UserAvatarSettingsController;
  ui: AppUiState;
};

export const PreferencesDialogContainer = memo(function PreferencesDialogContainer({
  actions,
  contactNotifications,
  mediaVisibilitySettings,
  userAvatarSettings,
  ui,
}: PreferencesDialogContainerProps) {
  const mutedNicks = useAppSelector(selectMutedNicks);
  const networks = useAppSelector(selectNetworks);
  const model = usePreferencesController({
    actions,
    contactNotifications,
    mediaVisibilitySettings,
    mutedNicks,
    networks,
    userAvatarSettings,
    ui,
  });
  return <PreferencesDialog {...model} />;
});

export const NetworkManagerDialogContainer = memo(function NetworkManagerDialogContainer({
  actions,
  externalAvatarsEnabled,
  mediaPolicy,
}: {
  actions: AppActions;
  externalAvatarsEnabled: boolean;
  mediaPolicy: MediaVisibilityPolicy;
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
      externalAvatarsEnabled={externalAvatarsEnabled}
      serverImagesVisible={mediaPolicy.showServerImages}
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
  externalAvatarsEnabled,
}: {
  actions: AppActions;
  externalAvatarsEnabled: boolean;
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
      activeTab={model.activeTab}
      externalAvatarsEnabled={externalAvatarsEnabled}
      form={model.form}
      onTabChange={model.onTabChange}
      onClose={model.onClose}
      onSubmit={model.onSubmit}
      onChange={model.onChange}
    />
  ) : null;
});
