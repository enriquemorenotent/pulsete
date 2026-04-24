import assert from 'node:assert/strict';
import test from 'node:test';
import type { Action, AppDomainState } from '../web/src/app-types.js';
import { emptyNetworkForm } from '../web/src/network-form.js';
import { openExistingNetworkEditor, openNewNetworkEditor } from '../web/src/network-editor-actions.js';

const network: AppDomainState['networks'][number] = {
  id: 'saved-network-1',
  workspaceOpen: false,
  name: 'TestNet',
  host: 'irc.example.test',
  port: 6697,
  tls: true,
  nick: 'tester',
  altNicks: ['tester_', 'tester__'],
  historicalSelfNicks: [],
  username: 'tester',
  realName: 'Tester',
  hasPassword: false,
  authMethod: 'none',
  authTarget: 'NickServ',
  authAccount: '',
  favorite: false,
  autoJoin: [],
};

test('openNewNetworkEditor starts with an empty form instead of a placeholder identity', () => {
  const actions: Action[] = [];

  openNewNetworkEditor({
    dispatch: (action) => {
      actions.push(action);
    },
  });

  assert.deepEqual(actions, [
    {
      type: 'open-network-editor',
      managedNetworkId: null,
      editor: {
        kind: 'new',
        tab: 'servers',
        returnMode: 'manager',
        form: emptyNetworkForm(),
      },
    },
  ]);
});

test('openExistingNetworkEditor can target the servers tab and return to the closed state', () => {
  const actions: Action[] = [];

  openExistingNetworkEditor(network, {
    dispatch: (action) => {
      actions.push(action);
    },
    initialTab: 'servers',
    returnMode: 'closed',
  });

  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0], {
    type: 'open-network-editor',
    managedNetworkId: network.id,
    editor: {
      kind: 'existing',
      tab: 'servers',
      returnMode: 'closed',
      form: {
        id: network.id,
        name: network.name,
        host: network.host,
        port: String(network.port),
        tls: network.tls,
        nick: network.nick,
        nick2: network.altNicks[0],
        nick3: network.altNicks[1],
        username: network.username,
        realName: network.realName,
        authMethod: 'none',
        authTarget: 'NickServ',
        authAccount: '',
        password: '',
        clearPassword: false,
        hasSavedPassword: false,
        favorite: false,
        autoJoin: '',
      },
    },
  });
});
