import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { useMemo } from 'react';
import type { MutedNickState, NetworkProfile } from '../../shared/protocol-chat.js';
import type {
  ContactNotificationChannel,
  ContactNotificationContact,
  ContactNotificationSettings,
} from './contact-notifications/settings.js';
import { PreferencesNotificationAllowedChannels } from './PreferencesNotificationAllowedChannels.js';
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
  onRemoveContactNotificationChannel: (channel: ContactNotificationChannel) => void;
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
  const sortedAudioChannels = useMemo(
    () => [...props.contactNotifications.channels].sort((left, right) =>
      compareNetworkChannels(left, right, networkNameById)),
    [networkNameById, props.contactNotifications.channels],
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
          Conversation Notifications
        </h3>
        <p className="text-[13px] text-muted-foreground">
          Turn notifications on from a PM or channel header, then choose how they should be delivered here.
        </p>
      </div>

      <div className="space-y-5 text-sm">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Delivery Methods
          </p>
          <p className="text-muted-foreground">
            Notification conversations can use one or both delivery methods below.
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
        <Tabs defaultValue="contacts">
          <TabsList aria-label="Notification lists" className="max-w-full rounded-lg">
            <TabsTrigger value="contacts" className="min-w-0">Contacts</TabsTrigger>
            <TabsTrigger value="channels" className="min-w-0">Channels</TabsTrigger>
            <TabsTrigger value="muted" className="min-w-0">Muted</TabsTrigger>
          </TabsList>
          <TabsContent value="contacts">
        <PreferencesNotificationAllowedContacts
          contacts={sortedAudioContacts}
          networkNameById={networkNameById}
          onRemoveContact={props.onRemoveContactNotificationContact}
        />
          </TabsContent>
          <TabsContent value="channels">
        <PreferencesNotificationAllowedChannels
          channels={sortedAudioChannels}
          networkNameById={networkNameById}
          onRemoveChannel={props.onRemoveContactNotificationChannel}
        />
          </TabsContent>
          <TabsContent value="muted">
        <PreferencesNotificationMutedNicks
          mutedNicks={sortedMutedNicks}
          networkNameById={networkNameById}
          onRemoveMutedNick={props.onRemoveMutedNick}
        />
          </TabsContent>
        </Tabs>
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

const compareNetworkChannels = (
  left: ContactNotificationChannel,
  right: ContactNotificationChannel,
  networkNameById: Map<string, string>,
) => {
  const leftNetwork = networkNameById.get(left.networkId) ?? left.networkId;
  const rightNetwork = networkNameById.get(right.networkId) ?? right.networkId;
  return leftNetwork === rightNetwork
    ? left.channel.localeCompare(right.channel)
    : leftNetwork.localeCompare(rightNetwork);
};
