import assert from 'node:assert/strict';
import test from 'node:test';
import type { ClientMessage } from '../shared/protocol.js';
import { sendComposerMessage } from '../web/src/composer-actions.js';
import type { Action } from '../web/src/app-types.js';
import type { WorkspaceView } from '../web/src/workspace-types.js';

const workspace: WorkspaceView = {
  mode: 'channel-connected',
  selection: { networkId: 'network-1', target: '#general', channelId: 'channel-1' },
  connectionInstances: [],
  selectedNetwork: null,
  selectedRuntime: null,
  selectedChannel: null,
  selectedQuery: null,
  headerTitle: '#general',
  headerSubtitle: '',
  statusLabel: 'Connected',
  composerMode: 'normal',
  composerPlaceholder: 'Message #general',
  emptyBody: '',
  showNicklist: true,
};

test('/msg sends a private message without opening or selecting a query buffer', () => {
  const actions: Action[] = [];
  const sent: ClientMessage[] = [];
  const drafts: string[] = [];
  const banners: Array<{ kind: 'notice' | 'error'; message: string }> = [];

  sendComposerMessage({
    draft: '/msg alice hello there',
    dispatch: (action) => actions.push(action),
    setDraft: (value) => drafts.push(value),
    socket: {
      send: (message) => sent.push(message),
      close: () => {},
    },
    updateBanner: (kind, message) => banners.push({ kind, message }),
    workspace,
  });

  assert.deepEqual(sent, [
    {
      type: 'message.send',
      networkId: 'network-1',
      target: 'alice',
      body: 'hello there',
      kind: 'message',
    },
  ]);
  assert.deepEqual(actions, []);
  assert.deepEqual(drafts, ['']);
  assert.deepEqual(banners, []);
});
