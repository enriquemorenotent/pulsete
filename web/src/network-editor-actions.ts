import type { Action, State } from './app-types.js';
import { toForm, type EditorTab } from './network-form.js';

type EditorActionParams = {
  dispatch: (action: Action) => void;
  setEditorTab: (value: EditorTab) => void;
  setManagedNetworkId: (value: string | null) => void;
  setShowNetworkManager: (value: boolean) => void;
  setShowNetworkEditor: (value: boolean) => void;
  state: State;
};

export function openNewNetworkEditor(params: EditorActionParams) {
  params.dispatch({
    type: 'reset-network-form',
    form: {
      nick: params.state.user?.username ?? '',
      nick2: params.state.user?.username ? `${params.state.user.username}_` : '',
      nick3: params.state.user?.username ? `${params.state.user.username}__` : '',
      username: params.state.user?.username ?? '',
      realName: params.state.user?.username ?? '',
    },
  });
  params.setEditorTab('servers');
  params.setShowNetworkManager(false);
  params.setShowNetworkEditor(true);
}

export function openExistingNetworkEditor(
  network: State['networks'][number],
  params: Omit<EditorActionParams, 'state'>,
) {
  params.dispatch({ type: 'reset-network-form', form: toForm(network) });
  params.setManagedNetworkId(network.id);
  params.setEditorTab('servers');
  params.setShowNetworkManager(false);
  params.setShowNetworkEditor(true);
}
