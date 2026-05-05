import { memo } from 'react';
import { selectNetworks } from './app-selectors.js';
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
  return (
    <LogInspectorDialog
      open={ui.logInspectorOpen}
      networks={networks}
      onOpenChange={(open) => {
        if (!open) {
          ui.closeLogInspector();
        }
      }}
      onSearch={actions.searchLogs}
    />
  );
});
