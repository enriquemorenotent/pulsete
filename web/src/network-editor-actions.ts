import { getLocalIrcIdentity } from '../../shared/local-defaults.js';
import type { Action, AppDomainState } from './app-types.js';
import { emptyNetworkForm, toForm } from './network-form.js';

type EditorActionParams = {
  dispatch: (action: Action) => void;
};

export function openNewNetworkEditor(params: EditorActionParams) {
  const identity = getLocalIrcIdentity();
  params.dispatch({
    type: 'open-network-editor',
    managedNetworkId: null,
    editor: {
      kind: 'new',
      tab: 'servers',
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
  params: EditorActionParams,
) {
  params.dispatch({
    type: 'open-network-editor',
    managedNetworkId: network.id,
    editor: {
      kind: 'existing',
      tab: 'servers',
      form: toForm(network),
    },
  });
}
