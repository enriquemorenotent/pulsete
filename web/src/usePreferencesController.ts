import { useMemo } from 'react';
import type { DesktopShellModel } from './desktop-shell-model.js';
import type { ContactNotificationsController } from './contact-notifications/controller.js';
import type { AppUiState } from './useAppUiState.js';
import type { MutedNickState, NetworkProfile } from '../../shared/protocol.js';

type PreferencesControllerParams = {
  actions: Pick<import('./useAppActions.js').AppActions, 'removeMutedNick'>;
  contactNotifications: ContactNotificationsController;
  mutedNicks: MutedNickState[];
  networks: NetworkProfile[];
  ui: Pick<AppUiState, 'closePreferences' | 'openPreferences' | 'preferencesOpen'>;
};

export function usePreferencesController({
  actions,
  contactNotifications,
  mutedNicks,
  networks,
  ui,
}: PreferencesControllerParams): DesktopShellModel['preferences'] {
  return useMemo(() => ({
    open: ui.preferencesOpen,
    contactNotifications: contactNotifications.settings,
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
  }), [
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
    actions.removeMutedNick,
    ui.closePreferences,
    ui.preferencesOpen,
  ]);
}
