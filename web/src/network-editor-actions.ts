import { getLocalIrcIdentity } from '../../shared/local-defaults.js';
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
  const identity = getLocalIrcIdentity();
  params.dispatch({
    type: 'reset-network-form',
    form: {
      nick: identity.nick,
      nick2: identity.altNicks[0] ?? '',
      nick3: identity.altNicks[1] ?? '',
      username: identity.username,
      realName: identity.realName,
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
