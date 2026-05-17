import type { MutedNickState, NetworkProfile } from '../../shared/protocol-chat.js';
import type {
  ContactNotificationContact,
  ContactNotificationSettings,
} from './contact-notifications/settings.js';
import { PreferencesAvatarSection } from './PreferencesAvatarSection.js';
import { PreferencesBackupSection } from './PreferencesBackupSection.js';
import { PreferencesNavigationSection } from './PreferencesNavigationSection.js';
import { PreferencesNotificationsPanel } from './PreferencesNotificationsPanel.js';
import type { NavigationLayoutSettings } from './navigation-layout-settings.js';
import type { UserAvatarSettings } from './user-avatars/settings.js';

export type PreferencesDialogBodyProps = {
  contactNotifications: ContactNotificationSettings;
  navigationLayoutSettings: NavigationLayoutSettings;
  userAvatarSettings: UserAvatarSettings;
  mutedNicks: MutedNickState[];
  networks: NetworkProfile[];
  onSetContactNotificationSoundEnabled: (enabled: boolean) => void;
  contactNotificationSystemPermission: NotificationPermission | 'unsupported';
  onSetContactNotificationSystemEnabled: (enabled: boolean) => void;
  onRequestContactNotificationSystemPermission: () => Promise<
    NotificationPermission | 'unsupported'
  >;
  onSetContactNotificationSound: (sound: ContactNotificationSettings['sound']) => void;
  onPreviewContactNotificationSound: (sound: ContactNotificationSettings['sound']) => void;
  onRemoveContactNotificationContact: (contact: ContactNotificationContact) => void;
  onRemoveMutedNick: (mutedNickId: string) => Promise<boolean>;
  onSetNavigationLayoutMode: (mode: NavigationLayoutSettings['mode']) => void;
  onSetExternalAvatarsEnabled: (enabled: boolean) => void;
  onExportBackup: () => Promise<void>;
  onImportBackup: (file: Blob) => Promise<void>;
};

export function PreferencesDialogBody(props: PreferencesDialogBodyProps) {
  return (
    <div className="space-y-6">
      <PreferencesNavigationSection
        mode={props.navigationLayoutSettings.mode}
        onSetMode={props.onSetNavigationLayoutMode}
      />
      <PreferencesAvatarSection
        settings={props.userAvatarSettings}
        onSetExternalAvatarsEnabled={props.onSetExternalAvatarsEnabled}
      />
      <PreferencesNotificationsPanel
        contactNotifications={props.contactNotifications}
        mutedNicks={props.mutedNicks}
        networks={props.networks}
        onSetContactNotificationSoundEnabled={props.onSetContactNotificationSoundEnabled}
        contactNotificationSystemPermission={props.contactNotificationSystemPermission}
        onSetContactNotificationSystemEnabled={props.onSetContactNotificationSystemEnabled}
        onRequestContactNotificationSystemPermission={props.onRequestContactNotificationSystemPermission}
        onSetContactNotificationSound={props.onSetContactNotificationSound}
        onPreviewContactNotificationSound={props.onPreviewContactNotificationSound}
        onRemoveContactNotificationContact={props.onRemoveContactNotificationContact}
        onRemoveMutedNick={props.onRemoveMutedNick}
      />
      <PreferencesBackupSection
        onExportBackup={props.onExportBackup}
        onImportBackup={props.onImportBackup}
      />
    </div>
  );
}
