import type { MutedNickState, NetworkProfile } from '../../shared/protocol.js';
import type {
  ContactNotificationContact,
  ContactNotificationSettings,
} from './contact-notifications/settings.js';
import { PreferencesNotificationsPanel } from './PreferencesNotificationsPanel.js';

export type PreferencesDialogBodyProps = {
  contactNotifications: ContactNotificationSettings;
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
};

export function PreferencesDialogBody(props: PreferencesDialogBodyProps) {
  return (
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
  );
}
