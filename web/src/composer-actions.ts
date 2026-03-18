import { api, type SocketHandle } from './client.js';
import type { Action } from './app-types.js';
import type { WorkspaceView } from './workspace-types.js';

type ComposerParams = {
  draft: string;
  dispatch: (action: Action) => void;
  setDraft: (value: string) => void;
  socket: SocketHandle | null;
  updateBanner: (kind: 'notice' | 'error', message: string) => void;
  workspace: WorkspaceView;
};

export function sendComposerMessage(params: ComposerParams) {
  const text = params.draft.trim();
  if (!text || !params.socket || !params.workspace.selection) {
    return;
  }
  if (params.workspace.composerMode === 'hidden') {
    return;
  }
  if (params.workspace.composerMode === 'commands' && !text.startsWith('/')) {
    params.updateBanner('error', 'The server buffer only accepts commands such as /join');
    return;
  }
  if (text.startsWith('/')) {
    runSlashCommand(text, params);
    return;
  }
  if (params.workspace.selection.target === 'server') {
    params.updateBanner('error', 'Select a channel or use /join first');
    return;
  }
  params.socket.send({
    type: 'message.send',
    networkId: params.workspace.selection.networkId,
    target: params.workspace.selection.target,
    body: text,
    kind: 'message',
  });
  params.setDraft('');
}

function runSlashCommand(text: string, params: ComposerParams) {
  const selection = params.workspace.selection;
  const socket = params.socket;
  if (!selection || !socket) {
    return;
  }
  const [firstWord, ...rest] = text.slice(1).split(' ');
  const command = firstWord.toLowerCase();
  const remainder = rest.join(' ').trim();

  switch (command) {
    case 'join':
      if (!remainder) return params.updateBanner('error', 'Usage: /join #channel');
      socket.send({ type: 'channel.join', networkId: selection.networkId, channel: remainder });
      params.dispatch({ type: 'select', selection: { networkId: selection.networkId, target: remainder, channelId: null } });
      break;
    case 'part': {
      const channel = remainder || selection.target;
      socket.send({ type: 'channel.part', networkId: selection.networkId, channel });
      params.dispatch({ type: 'select', selection: { networkId: selection.networkId, target: 'server', channelId: null } });
      break;
    }
    case 'msg': {
      if (!remainder) return params.updateBanner('error', 'Usage: /msg target text');
      const [target, ...messageParts] = remainder.split(' ');
      const body = messageParts.join(' ').trim();
      if (!target || !body) return params.updateBanner('error', 'Usage: /msg target text');
      socket.send({ type: 'message.send', networkId: selection.networkId, target, body, kind: 'message' });
      if (!target.startsWith('#') && !target.startsWith('&') && !target.startsWith('+') && !target.startsWith('!')) {
        void api.openQuery(selection.networkId, target).then((result) => {
          params.dispatch({ type: 'upsert-query', query: result.query });
          params.dispatch({ type: 'select', selection: { networkId: selection.networkId, target, channelId: null } });
        });
      }
      break;
    }
    case 'me':
      if (!remainder) return params.updateBanner('error', 'Usage: /me action');
      socket.send({ type: 'message.send', networkId: selection.networkId, target: selection.target, body: remainder, kind: 'action' });
      break;
    case 'nick':
      if (!remainder) return params.updateBanner('error', 'Usage: /nick newnick');
      socket.send({ type: 'raw.send', networkId: selection.networkId, raw: `NICK ${remainder}` });
      break;
    case 'topic':
      if (!remainder) return params.updateBanner('error', 'Usage: /topic text');
      socket.send({ type: 'raw.send', networkId: selection.networkId, raw: `TOPIC ${selection.target} :${remainder}` });
      break;
    case 'raw':
      if (!remainder) return params.updateBanner('error', 'Usage: /raw IRC line');
      socket.send({ type: 'raw.send', networkId: selection.networkId, raw: remainder });
      break;
    case 'connect':
      socket.send({ type: 'network.connect', networkId: selection.networkId });
      break;
    case 'disconnect':
      socket.send({ type: 'network.disconnect', networkId: selection.networkId });
      break;
    default:
      return params.updateBanner('error', `Unknown command: /${command}`);
  }

  params.setDraft('');
}
