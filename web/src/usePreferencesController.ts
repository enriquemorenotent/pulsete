import { useMemo } from 'react';
import type { DesktopShellModel } from './desktop-shell-model.js';
import type { ContactNotificationsController } from './contact-notifications/controller.js';
import type { UserAvatarSettingsController } from './user-avatars/settings.js';
import type { AppUiState } from './useAppUiState.js';
import type { MutedNickState, NetworkProfile } from '../../shared/protocol.js';

type PreferencesControllerParams = {
  actions: Pick<
    import('./useAppActions.js').AppActions,
    'exportBackup' | 'importBackup' | 'removeMutedNick'
  >;
  contactNotifications: ContactNotificationsController;
  mutedNicks: MutedNickState[];
  networks: NetworkProfile[];
  userAvatarSettings: UserAvatarSettingsController;
  ui: Pick<AppUiState, 'closePreferences' | 'openPreferences' | 'preferencesOpen'>;
};

export function usePreferencesController({
  actions,
  contactNotifications,
  mutedNicks,
  networks,
  userAvatarSettings,
  ui,
}: PreferencesControllerParams): DesktopShellModel['preferences'] {
  return useMemo(() => ({
    open: ui.preferencesOpen,
    contactNotifications: contactNotifications.settings,
    userAvatarSettings: userAvatarSettings.settings,
    mutedNicks,
    networks,
    onClose: ui.closePreferences,
    onSetContactNotificationSoundEnabled: (enabled) => {
      contactNotifications.setEnabled(enabled);
      if (enabled) {
        contactNotifications.prime();
      }
    },
    contactNotificationSystemPermission: contactNotifications.systemPermission,
    onSetContactNotificationSystemEnabled: contactNotifications.setSystemEnabled,
    onRequestContactNotificationSystemPermission: contactNotifications.requestSystemPermission,
    onSetContactNotificationSound: contactNotifications.setSound,
    onPreviewContactNotificationSound: contactNotifications.preview,
    onRemoveContactNotificationContact: contactNotifications.removeContact,
    onRemoveMutedNick: actions.removeMutedNick,
    onSetExternalAvatarsEnabled: userAvatarSettings.setExternalAvatarsEnabled,
    onExportBackup: actions.exportBackup,
    onImportBackup: actions.importBackup,
  }), [
    actions.exportBackup,
    actions.importBackup,
    actions.removeMutedNick,
    contactNotifications.removeContact,
    contactNotifications.setEnabled,
    contactNotifications.setSystemEnabled,
    contactNotifications.setSound,
    contactNotifications.settings,
    contactNotifications.systemPermission,
    contactNotifications.requestSystemPermission,
    contactNotifications.prime,
    contactNotifications.preview,
    mutedNicks,
    networks,
    userAvatarSettings.settings,
    userAvatarSettings.setExternalAvatarsEnabled,
    ui.closePreferences,
    ui.preferencesOpen,
  ]);
}
