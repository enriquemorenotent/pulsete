import type { Action, State } from './app-types.js';
import type { NetworkEditorDialogProps } from './NetworkEditorDialog.js';
import { emptyNetworkForm } from './network-form.js';
import type { NetworkEditorActionSet } from './useAppActions.js';

type NetworkEditorControllerParams = {
  actions: NetworkEditorActionSet;
  dispatch: (action: Action) => void;
  editor: State['transient']['networkManager']['editor'];
  mode: State['transient']['networkManager']['mode'];
};

export function useNetworkEditorController({
  actions,
  dispatch,
  editor,
  mode,
}: NetworkEditorControllerParams): NetworkEditorDialogProps & { open: boolean } {
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
    open: mode === 'editor',
    form: editor?.form ?? emptyNetworkForm(),
    activeTab: editor?.tab ?? 'servers',
    onTabChange: (tab) => dispatch({ type: 'set-network-editor-tab', tab }),
    onClose: () => dispatch({ type: 'close-network-editor' }),
    onSubmit: submitNetwork,
    onChange: (form) => dispatch({ type: 'update-network-editor-form', form }),
  };
}
