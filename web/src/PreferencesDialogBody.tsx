import type { MutedNickState, NetworkProfile } from '../../shared/protocol.js';
import type {
  BackgroundDmAudioContact,
  BackgroundDmAudioSettings,
} from './background-dm-audio.js';
import { PreferencesNotificationsPanel } from './PreferencesNotificationsPanel.js';

export type PreferencesDialogBodyProps = {
  backgroundDmAudio: BackgroundDmAudioSettings;
  mutedNicks: MutedNickState[];
  networks: NetworkProfile[];
  onSetBackgroundDmAudioEnabled: (enabled: boolean) => void;
  backgroundDmAudioSystemPermission: NotificationPermission | 'unsupported';
  onSetBackgroundDmAudioSystemEnabled: (enabled: boolean) => void;
  onRequestBackgroundDmAudioSystemPermission: () => Promise<
    NotificationPermission | 'unsupported'
  >;
  onSetBackgroundDmAudioSound: (sound: BackgroundDmAudioSettings['sound']) => void;
  onPreviewBackgroundDmAudioSound: (sound: BackgroundDmAudioSettings['sound']) => void;
  onRemoveBackgroundDmAudioContact: (contact: BackgroundDmAudioContact) => void;
  onRemoveMutedNick: (mutedNickId: string) => Promise<boolean>;
};

export function PreferencesDialogBody(props: PreferencesDialogBodyProps) {
  return (
    <PreferencesNotificationsPanel
      backgroundDmAudio={props.backgroundDmAudio}
      mutedNicks={props.mutedNicks}
      networks={props.networks}
      onSetBackgroundDmAudioEnabled={props.onSetBackgroundDmAudioEnabled}
      backgroundDmAudioSystemPermission={props.backgroundDmAudioSystemPermission}
      onSetBackgroundDmAudioSystemEnabled={props.onSetBackgroundDmAudioSystemEnabled}
      onRequestBackgroundDmAudioSystemPermission={props.onRequestBackgroundDmAudioSystemPermission}
      onSetBackgroundDmAudioSound={props.onSetBackgroundDmAudioSound}
      onPreviewBackgroundDmAudioSound={props.onPreviewBackgroundDmAudioSound}
      onRemoveBackgroundDmAudioContact={props.onRemoveBackgroundDmAudioContact}
      onRemoveMutedNick={props.onRemoveMutedNick}
    />
  );
}
