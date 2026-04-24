import { useMemo } from 'react';
import type { MutedNickState, NetworkProfile } from '../../shared/protocol.js';
import type {
  BackgroundDmAudioContact,
  BackgroundDmAudioSettings,
} from './background-dm-audio.js';
import { PreferencesNotificationAllowedContacts } from './PreferencesNotificationAllowedContacts.js';
import { PreferencesNotificationMutedNicks } from './PreferencesNotificationMutedNicks.js';
import { PreferencesNotificationSoundSection } from './PreferencesNotificationSoundSection.js';
import {
  PreferencesNotificationSystemSection,
  type NotificationPermissionState,
} from './PreferencesNotificationSystemSection.js';

type PreferencesNotificationsPanelProps = {
  backgroundDmAudio: BackgroundDmAudioSettings;
  backgroundDmAudioSystemPermission: NotificationPermissionState;
  mutedNicks: MutedNickState[];
  networks: NetworkProfile[];
  onPreviewBackgroundDmAudioSound: (sound: BackgroundDmAudioSettings['sound']) => void;
  onRemoveBackgroundDmAudioContact: (contact: BackgroundDmAudioContact) => void;
  onRemoveMutedNick: (mutedNickId: string) => Promise<boolean>;
  onRequestBackgroundDmAudioSystemPermission: () => Promise<NotificationPermissionState>;
  onSetBackgroundDmAudioEnabled: (enabled: boolean) => void;
  onSetBackgroundDmAudioSound: (sound: BackgroundDmAudioSettings['sound']) => void;
  onSetBackgroundDmAudioSystemEnabled: (enabled: boolean) => void;
};

export function PreferencesNotificationsPanel(props: PreferencesNotificationsPanelProps) {
  const networkNameById = useMemo(
    () => new Map(props.networks.map((network) => [network.id, network.name])),
    [props.networks],
  );
  const sortedAudioContacts = useMemo(
    () => [...props.backgroundDmAudio.contacts].sort((left, right) =>
      compareNetworkNicks(left, right, networkNameById)),
    [networkNameById, props.backgroundDmAudio.contacts],
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
          enabled={props.backgroundDmAudio.enabled}
          sound={props.backgroundDmAudio.sound}
          onPreviewSound={props.onPreviewBackgroundDmAudioSound}
          onSetEnabled={props.onSetBackgroundDmAudioEnabled}
          onSetSound={props.onSetBackgroundDmAudioSound}
        />
        <PreferencesNotificationSystemSection
          enabled={props.backgroundDmAudio.systemEnabled}
          permission={props.backgroundDmAudioSystemPermission}
          onRequestPermission={props.onRequestBackgroundDmAudioSystemPermission}
          onSetEnabled={props.onSetBackgroundDmAudioSystemEnabled}
        />
        <PreferencesNotificationAllowedContacts
          contacts={sortedAudioContacts}
          networkNameById={networkNameById}
          onRemoveContact={props.onRemoveBackgroundDmAudioContact}
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
  left: Pick<BackgroundDmAudioContact | MutedNickState, 'networkId' | 'nick'>,
  right: Pick<BackgroundDmAudioContact | MutedNickState, 'networkId' | 'nick'>,
  networkNameById: Map<string, string>,
) => {
  const leftNetwork = networkNameById.get(left.networkId) ?? left.networkId;
  const rightNetwork = networkNameById.get(right.networkId) ?? right.networkId;
  return leftNetwork === rightNetwork
    ? left.nick.localeCompare(right.nick)
    : leftNetwork.localeCompare(rightNetwork);
};
