import { useMemo } from 'react';
import type { MutedNickState, NetworkProfile } from '../../shared/protocol-chat.js';
import type {
  ContactNotificationContact,
  ContactNotificationSettings,
} from './contact-notifications/settings.js';
import { PreferencesNotificationAllowedContacts } from './PreferencesNotificationAllowedContacts.js';
import { PreferencesNotificationMutedNicks } from './PreferencesNotificationMutedNicks.js';
import { PreferencesNotificationSoundSection } from './PreferencesNotificationSoundSection.js';
import {
  PreferencesNotificationSystemSection,
  type NotificationPermissionState,
} from './PreferencesNotificationSystemSection.js';

type PreferencesNotificationsPanelProps = {
  contactNotifications: ContactNotificationSettings;
  contactNotificationSystemPermission: NotificationPermissionState;
  mutedNicks: MutedNickState[];
  networks: NetworkProfile[];
  onPreviewContactNotificationSound: (sound: ContactNotificationSettings['sound']) => void;
  onRemoveContactNotificationContact: (contact: ContactNotificationContact) => void;
  onRemoveMutedNick: (mutedNickId: string) => Promise<boolean>;
  onRequestContactNotificationSystemPermission: () => Promise<NotificationPermissionState>;
  onSetContactNotificationSoundEnabled: (enabled: boolean) => void;
  onSetContactNotificationSound: (sound: ContactNotificationSettings['sound']) => void;
  onSetContactNotificationSystemEnabled: (enabled: boolean) => void;
};

export function PreferencesNotificationsPanel(props: PreferencesNotificationsPanelProps) {
  const networkNameById = useMemo(
    () => new Map(props.networks.map((network) => [network.id, network.name])),
    [props.networks],
  );
  const sortedAudioContacts = useMemo(
    () => [...props.contactNotifications.contacts].sort((left, right) =>
      compareNetworkNicks(left, right, networkNameById)),
    [networkNameById, props.contactNotifications.contacts],
  );
  const sortedMutedNicks = useMemo(
    () => [...props.mutedNicks].sort((left, right) =>
      compareNetworkNicks(left, right, networkNameById)),
    [networkNameById, props.mutedNicks],
  );

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          Private Message Notifications
        </h3>
        <p className="text-[13px] text-muted-foreground">
          Turn notifications on from a contact button, then choose how they should be delivered here.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-secondary/30 px-4 py-4 text-[13px]">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Delivery Methods
          </p>
          <p className="text-muted-foreground">
            Notification contacts can use one or both delivery methods below.
          </p>
        </div>
        <PreferencesNotificationSoundSection
          enabled={props.contactNotifications.enabled}
          sound={props.contactNotifications.sound}
          onPreviewSound={props.onPreviewContactNotificationSound}
          onSetEnabled={props.onSetContactNotificationSoundEnabled}
          onSetSound={props.onSetContactNotificationSound}
        />
        <PreferencesNotificationSystemSection
          enabled={props.contactNotifications.systemEnabled}
          permission={props.contactNotificationSystemPermission}
          onRequestPermission={props.onRequestContactNotificationSystemPermission}
          onSetEnabled={props.onSetContactNotificationSystemEnabled}
        />
        <PreferencesNotificationAllowedContacts
          contacts={sortedAudioContacts}
          networkNameById={networkNameById}
          onRemoveContact={props.onRemoveContactNotificationContact}
        />
        <PreferencesNotificationMutedNicks
          mutedNicks={sortedMutedNicks}
          networkNameById={networkNameById}
          onRemoveMutedNick={props.onRemoveMutedNick}
        />
      </div>
    </section>
  );
}

const compareNetworkNicks = (
  left: Pick<ContactNotificationContact | MutedNickState, 'networkId' | 'nick'>,
  right: Pick<ContactNotificationContact | MutedNickState, 'networkId' | 'nick'>,
  networkNameById: Map<string, string>,
) => {
  const leftNetwork = networkNameById.get(left.networkId) ?? left.networkId;
  const rightNetwork = networkNameById.get(right.networkId) ?? right.networkId;
  return leftNetwork === rightNetwork
    ? left.nick.localeCompare(right.nick)
    : leftNetwork.localeCompare(rightNetwork);
};
