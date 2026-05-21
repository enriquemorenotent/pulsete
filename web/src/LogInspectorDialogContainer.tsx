import { memo } from 'react';
import { selectMutedNicks, selectNetworks, selectNickEmojis } from './app-selectors.js';
import { useAppSelector } from './app-store.js';
import { LogInspectorDialog } from './LogInspectorDialog.js';
import type { AppActions } from './useAppActions.js';
import type { AppUiState } from './useAppUiState.js';

type LogInspectorDialogContainerProps = {
  actions: AppActions;
  ui: AppUiState;
};

export const LogInspectorDialogContainer = memo(function LogInspectorDialogContainer({
  actions,
  ui,
}: LogInspectorDialogContainerProps) {
  const networks = useAppSelector(selectNetworks);
  const mutedNicks = useAppSelector(selectMutedNicks);
  const nickEmojis = useAppSelector(selectNickEmojis);
  return (
    <LogInspectorDialog
      open={ui.logInspectorOpen}
      mutedNicks={mutedNicks}
      networks={networks}
      nickEmojis={nickEmojis}
      onListLogSources={actions.listLogSources}
      onLoadHistory={actions.loadBufferHistory}
      onOpenChange={(open) => {
        if (!open) {
          ui.closeLogInspector();
        }
      }}
      onSearch={actions.searchLogs}
    />
  );
});
