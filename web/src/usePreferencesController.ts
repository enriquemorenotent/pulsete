import { useMemo } from 'react';
import type { State } from './app-types.js';
import type { DesktopShellModel } from './desktop-shell-model.js';
import type { AppUiState } from './useAppUiState.js';
import type { AssistantActionSet } from './useAppActions.js';

type PreferencesControllerParams = {
  actions: AssistantActionSet;
  assistant: State['domain']['assistant'];
  ui: Pick<AppUiState, 'closePreferences' | 'openPreferences' | 'preferencesOpen'>;
};

export function usePreferencesController({
  actions,
  assistant,
  ui,
}: PreferencesControllerParams): DesktopShellModel['preferences'] {
  return useMemo(() => ({
    open: ui.preferencesOpen,
    assistant,
    onClose: ui.closePreferences,
    onStartLogin: actions.startAssistantChatgptLogin,
    onCancelLogin: actions.cancelAssistantLogin,
    onLogout: actions.logoutAssistant,
    onChangeModel: actions.updateAssistantDefaultModel,
  }), [
    actions.cancelAssistantLogin,
    actions.logoutAssistant,
    actions.startAssistantChatgptLogin,
    actions.updateAssistantDefaultModel,
    assistant,
    ui.closePreferences,
    ui.preferencesOpen,
  ]);
}
