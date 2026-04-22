import assert from 'node:assert/strict';
import test from 'node:test';
import type { Action, AppDomainState } from '../web/src/app-types.js';
import { openExistingNetworkEditor } from '../web/src/network-editor-actions.js';

const network: AppDomainState['networks'][number] = {
  id: 'saved-network-1',
  templateId: null,
  managerHidden: false,
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
  personaNote: 'White 30yo female',
};

test('openExistingNetworkEditor can target the persona tab and return to the closed state', () => {
  const actions: Action[] = [];

  openExistingNetworkEditor(network, {
    dispatch: (action) => {
      actions.push(action);
    },
    initialTab: 'persona',
    returnMode: 'closed',
  });

  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0], {
    type: 'open-network-editor',
    managedNetworkId: network.id,
    editor: {
      kind: 'existing',
      tab: 'persona',
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
        personaNote: 'White 30yo female',
      },
    },
  });
});
