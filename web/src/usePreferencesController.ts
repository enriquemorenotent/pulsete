import { useMemo } from 'react';
import type { DesktopShellModel } from './desktop-shell-model.js';
import type { BackgroundDmAudioSettings, BackgroundDmAudioContact } from './background-dm-audio.js';
import type { AppUiState } from './useAppUiState.js';
import type { MutedNickState, NetworkProfile } from '../../shared/protocol.js';

type PreferencesControllerParams = {
  actions: Pick<import('./useAppActions.js').AppActions, 'removeMutedNick'>;
  backgroundDmAudio: {
    settings: BackgroundDmAudioSettings;
    systemPermission: NotificationPermission | 'unsupported';
    setEnabled: (enabled: boolean) => void;
    setSystemEnabled: (enabled: boolean) => void;
    setSound: (sound: BackgroundDmAudioSettings['sound']) => void;
    removeContact: (contact: BackgroundDmAudioContact) => void;
    requestSystemPermission: () => Promise<NotificationPermission | 'unsupported'>;
  };
  mutedNicks: MutedNickState[];
  networks: NetworkProfile[];
  primeBackgroundDmAudio: () => void;
  previewBackgroundDmAudio: (sound: BackgroundDmAudioSettings['sound']) => void;
  ui: Pick<AppUiState, 'closePreferences' | 'openPreferences' | 'preferencesOpen'>;
};

export function usePreferencesController({
  actions,
  backgroundDmAudio,
  mutedNicks,
  networks,
  primeBackgroundDmAudio,
  previewBackgroundDmAudio,
  ui,
}: PreferencesControllerParams): DesktopShellModel['preferences'] {
  return useMemo(() => ({
    open: ui.preferencesOpen,
    backgroundDmAudio: backgroundDmAudio.settings,
    mutedNicks,
    networks,
    onClose: ui.closePreferences,
    onSetBackgroundDmAudioEnabled: (enabled) => {
      backgroundDmAudio.setEnabled(enabled);
      if (enabled) {
        primeBackgroundDmAudio();
      }
    },
    backgroundDmAudioSystemPermission: backgroundDmAudio.systemPermission,
    onSetBackgroundDmAudioSystemEnabled: backgroundDmAudio.setSystemEnabled,
    onRequestBackgroundDmAudioSystemPermission: backgroundDmAudio.requestSystemPermission,
    onSetBackgroundDmAudioSound: backgroundDmAudio.setSound,
    onPreviewBackgroundDmAudioSound: previewBackgroundDmAudio,
    onRemoveBackgroundDmAudioContact: backgroundDmAudio.removeContact,
    onRemoveMutedNick: actions.removeMutedNick,
  }), [
    backgroundDmAudio.removeContact,
    backgroundDmAudio.setEnabled,
    backgroundDmAudio.setSystemEnabled,
    backgroundDmAudio.setSound,
    backgroundDmAudio.settings,
    backgroundDmAudio.systemPermission,
    backgroundDmAudio.requestSystemPermission,
    mutedNicks,
    networks,
    actions.removeMutedNick,
    primeBackgroundDmAudio,
    previewBackgroundDmAudio,
    ui.closePreferences,
    ui.preferencesOpen,
  ]);
}
