import type { MutedNickState, NetworkProfile } from '../../shared/protocol-chat.js';
import type {
  ContactNotificationChannel,
  ContactNotificationContact,
  ContactNotificationSettings,
} from './contact-notifications/settings.js';
import { PreferencesAvatarSection } from './PreferencesAvatarSection.js';
import { PreferencesBackupSection } from './PreferencesBackupSection.js';
import { PreferencesMediaSection } from './PreferencesMediaSection.js';
import { PreferencesNotificationsPanel } from './PreferencesNotificationsPanel.js';
import type { MediaVisibilitySettings } from './media-visibility-settings.js';
import type { UserAvatarSettings } from './user-avatars/settings.js';

export type PreferencesDialogBodyProps = {
  contactNotifications: ContactNotificationSettings;
  mediaVisibilitySettings: MediaVisibilitySettings;
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
  onRemoveContactNotificationChannel: (channel: ContactNotificationChannel) => void;
  onRemoveContactNotificationContact: (contact: ContactNotificationContact) => void;
  onRemoveMutedNick: (mutedNickId: string) => Promise<boolean>;
  onSetMediaVisibilityMode: (mode: MediaVisibilitySettings['mode']) => void;
  onSetExternalAvatarsEnabled: (enabled: boolean) => void;
  onExportBackup: () => Promise<void>;
  onImportBackup: (file: Blob) => Promise<void>;
};

export function PreferencesDialogBody(props: PreferencesDialogBodyProps) {
  return (
    <div className="space-y-6">
      <PreferencesMediaSection
        mode={props.mediaVisibilitySettings.mode}
        onSetMode={props.onSetMediaVisibilityMode}
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
        onRemoveContactNotificationChannel={props.onRemoveContactNotificationChannel}
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
