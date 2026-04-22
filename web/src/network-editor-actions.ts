import { getLocalIrcIdentity } from '../../shared/local-defaults.js';
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
  const identity = getLocalIrcIdentity();
  params.dispatch({
    type: 'open-network-editor',
    managedNetworkId: null,
    editor: {
      kind: 'new',
      tab: params.initialTab ?? 'servers',
      returnMode: params.returnMode ?? 'manager',
      form: {
        ...emptyNetworkForm(),
        nick: identity.nick,
        nick2: identity.altNicks[0] ?? '',
        nick3: identity.altNicks[1] ?? '',
        username: identity.username,
        realName: identity.realName,
      },
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
