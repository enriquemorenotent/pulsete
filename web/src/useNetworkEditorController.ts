import type { Action, State } from './app-types.js';
import type { DesktopShellProps } from './DesktopShell.js';
import { emptyNetworkForm } from './network-form.js';
import type { useAppActions } from './useAppActions.js';

type NetworkEditorControllerParams = {
  actions: ReturnType<typeof useAppActions>;
  dispatch: (action: Action) => void;
  state: State;
};

export function useNetworkEditorController({
  actions,
  dispatch,
  state,
}: NetworkEditorControllerParams): DesktopShellProps['networkEditor'] {
  const editor = state.transient.networkManager.editor;

  const submitNetwork = async () => {
    if (!editor) {
      return;
    }
    const network = await actions.submitNetwork(editor.form);
    if (!network) {
      return;
    }
    dispatch({ type: 'set-managed-network', networkId: network.id });
    dispatch({ type: 'close-network-editor' });
  };

  return {
    open: state.transient.networkManager.mode === 'editor',
    form: editor?.form ?? emptyNetworkForm(),
    activeTab: editor?.tab ?? 'servers',
    onTabChange: (tab) => dispatch({ type: 'set-network-editor-tab', tab }),
    onClose: () => dispatch({ type: 'close-network-editor' }),
    onSubmit: submitNetwork,
    onChange: (form) => dispatch({ type: 'update-network-editor-form', form }),
  };
}
