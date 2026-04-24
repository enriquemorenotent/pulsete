import type { Action, AppDomainState, NetworkEditorState } from './app-types.js';
import { emptyNetworkForm, toForm, type EditorTab } from './network-form.js';

type EditorActionParams = {
  dispatch: (action: Action) => void;
};

type OpenNetworkEditorOptions = EditorActionParams & {
  initialTab?: EditorTab;
  returnMode?: NetworkEditorState['returnMode'];
};

export function openNewNetworkEditor(params: OpenNetworkEditorOptions) {
  params.dispatch({
    type: 'open-network-editor',
    managedNetworkId: null,
    editor: {
      kind: 'new',
      tab: params.initialTab ?? 'servers',
      returnMode: params.returnMode ?? 'manager',
      form: emptyNetworkForm(),
    },
  });
}

export function openExistingNetworkEditor(
  network: AppDomainState['networks'][number],
  params: OpenNetworkEditorOptions,
) {
  params.dispatch({
    type: 'open-network-editor',
    managedNetworkId: network.id,
    editor: {
      kind: 'existing',
      tab: params.initialTab ?? 'servers',
      returnMode: params.returnMode ?? 'manager',
      form: toForm(network),
    },
  });
}
