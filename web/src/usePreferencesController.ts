import { useMemo } from 'react';
import type { State } from './app-types.js';
import type { DesktopShellModel } from './desktop-shell-model.js';
import type { BackgroundDmAudioSettings, BackgroundDmAudioContact } from './background-dm-audio.js';
import type { AppUiState } from './useAppUiState.js';
import type { AssistantActionSet } from './useAppActions.js';
import type { NetworkProfile } from '../../shared/protocol.js';

type PreferencesControllerParams = {
  actions: AssistantActionSet;
  assistant: State['domain']['assistant'];
  backgroundDmAudio: {
    settings: BackgroundDmAudioSettings;
    systemPermission: NotificationPermission | 'unsupported';
    setEnabled: (enabled: boolean) => void;
    setSystemEnabled: (enabled: boolean) => void;
    setSound: (sound: BackgroundDmAudioSettings['sound']) => void;
    removeContact: (contact: BackgroundDmAudioContact) => void;
    requestSystemPermission: () => Promise<NotificationPermission | 'unsupported'>;
  };
  networks: NetworkProfile[];
  primeBackgroundDmAudio: () => void;
  previewBackgroundDmAudio: (sound: BackgroundDmAudioSettings['sound']) => void;
  ui: Pick<AppUiState, 'closePreferences' | 'openPreferences' | 'preferencesOpen'>;
};

export function usePreferencesController({
  actions,
  assistant,
  backgroundDmAudio,
  networks,
  primeBackgroundDmAudio,
  previewBackgroundDmAudio,
  ui,
}: PreferencesControllerParams): DesktopShellModel['preferences'] {
  return useMemo(() => ({
    open: ui.preferencesOpen,
    assistant,
    backgroundDmAudio: backgroundDmAudio.settings,
    networks,
    onClose: ui.closePreferences,
    onStartLogin: actions.startAssistantChatgptLogin,
    onCancelLogin: actions.cancelAssistantLogin,
    onLogout: actions.logoutAssistant,
    onChangeModel: actions.updateAssistantDefaultModel,
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
  }), [
    actions.cancelAssistantLogin,
    actions.logoutAssistant,
    actions.startAssistantChatgptLogin,
    actions.updateAssistantDefaultModel,
    assistant,
    backgroundDmAudio.removeContact,
    backgroundDmAudio.setEnabled,
    backgroundDmAudio.setSystemEnabled,
    backgroundDmAudio.setSound,
    backgroundDmAudio.settings,
    backgroundDmAudio.systemPermission,
    backgroundDmAudio.requestSystemPermission,
    networks,
    primeBackgroundDmAudio,
    previewBackgroundDmAudio,
    ui.closePreferences,
    ui.preferencesOpen,
  ]);
}
