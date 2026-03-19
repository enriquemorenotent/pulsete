import type { SocketHandle } from './client.js';
import type { Action } from './app-types.js';
import type { WorkspaceView } from './workspace-types.js';

const isChannelTarget = (value: string) => /^[#&+!]/.test(value);

type ComposerParams = {
  draft: string;
  dispatch: (action: Action) => void;
  setDraft: (value: string) => void;
  socket: SocketHandle | null;
  updateBanner: (kind: 'notice' | 'error', message: string) => void;
  workspace: WorkspaceView;
  onOpenChannel: (networkId: string, channel: string) => Promise<void>;
  onOpenQuery: (networkId: string, nick: string) => Promise<void>;
};

export async function sendComposerMessage(params: ComposerParams) {
  const text = params.draft.trim();
  const selection = params.workspace.selectedBuffer;
  if (!text || !params.socket || !selection) {
    return null;
  }
  if (params.workspace.composerMode === 'hidden') {
    return null;
  }
  if (params.workspace.composerMode === 'commands' && !text.startsWith('/')) {
    params.updateBanner('error', 'The server buffer only accepts commands such as /join');
    return null;
  }
  if (text.startsWith('/')) {
    return runSlashCommand(text, params);
  }
  if (selection.kind === 'server') {
    params.updateBanner('error', 'Select a channel or use /join first');
    return null;
  }
  params.socket.send({
    type: 'message.send',
    networkId: selection.networkId,
    target: selection.target,
    body: text,
    kind: 'message',
  });
  params.setDraft('');
  return text;
}

async function runSlashCommand(text: string, params: ComposerParams) {
  const selection = params.workspace.selectedBuffer;
  const socket = params.socket;
  if (!selection || !socket) {
    return;
  }
  const [firstWord, ...rest] = text.slice(1).split(' ');
  const command = normalizeCommand(firstWord);
  const remainder = rest.join(' ').trim();

  switch (command) {
    case 'join':
      if (!remainder) {
        params.updateBanner('error', 'Usage: /join #channel');
        return null;
      }
      if (!isChannelTarget(remainder)) {
        params.updateBanner('error', 'Channel name must start with #, &, +, or !');
        return null;
      }
      await params.onOpenChannel(selection.networkId, remainder);
      break;
    case 'part': {
      const channel = remainder || selection.target;
      socket.send({ type: 'channel.part', networkId: selection.networkId, channel });
      break;
    }
    case 'msg': {
      if (!remainder) {
        params.updateBanner('error', 'Usage: /msg target text');
        return null;
      }
      const [target, ...messageParts] = remainder.split(' ');
      const body = messageParts.join(' ').trim();
      if (!target || !body) {
        params.updateBanner('error', 'Usage: /msg target text');
        return null;
      }
      socket.send({ type: 'message.send', networkId: selection.networkId, target, body, kind: 'message' });
      break;
    }
    case 'query':
      if (!remainder) {
        params.updateBanner('error', 'Usage: /query nick');
        return null;
      }
      await params.onOpenQuery(selection.networkId, remainder);
      break;
    case 'whois':
      if (!remainder) {
        params.updateBanner('error', 'Usage: /whois nick');
        return null;
      }
      socket.send({ type: 'raw.send', networkId: selection.networkId, raw: `WHOIS ${remainder}` });
      break;
    case 'nickserv':
      if (!remainder) {
        params.updateBanner('error', 'Usage: /ns command');
        return null;
      }
      socket.send({ type: 'message.send', networkId: selection.networkId, target: 'NickServ', body: remainder, kind: 'message' });
      break;
    case 'chanserv':
      if (!remainder) {
        params.updateBanner('error', 'Usage: /cs command');
        return null;
      }
      socket.send({ type: 'message.send', networkId: selection.networkId, target: 'ChanServ', body: remainder, kind: 'message' });
      break;
    case 'me':
      if (!remainder) {
        params.updateBanner('error', 'Usage: /me action');
        return null;
      }
      socket.send({ type: 'message.send', networkId: selection.networkId, target: selection.target, body: remainder, kind: 'action' });
      break;
    case 'nick':
      if (!remainder) {
        params.updateBanner('error', 'Usage: /nick newnick');
        return null;
      }
      socket.send({ type: 'raw.send', networkId: selection.networkId, raw: `NICK ${remainder}` });
      break;
    case 'topic':
      if (!remainder) {
        params.updateBanner('error', 'Usage: /topic text');
        return null;
      }
      socket.send({ type: 'raw.send', networkId: selection.networkId, raw: `TOPIC ${selection.target} :${remainder}` });
      break;
    case 'raw':
      if (!remainder) {
        params.updateBanner('error', 'Usage: /raw IRC line');
        return null;
      }
      socket.send({ type: 'raw.send', networkId: selection.networkId, raw: remainder });
      break;
    case 'connect':
      socket.send({ type: 'network.connect', networkId: selection.networkId });
      break;
    case 'disconnect':
      socket.send({ type: 'network.disconnect', networkId: selection.networkId });
      break;
    default:
      params.updateBanner('error', `Unknown command: /${command}`);
      return null;
  }

  params.setDraft('');
  return text;
}

const normalizeCommand = (value: string) => {
  const command = value.toLowerCase();
  if (command === 'j') {
    return 'join';
  }
  if (command === 'p') {
    return 'part';
  }
  if (command === 'm') {
    return 'msg';
  }
  if (command === 'n') {
    return 'nick';
  }
  if (command === 'w') {
    return 'whois';
  }
  if (command === 'ns') {
    return 'nickserv';
  }
  if (command === 'cs') {
    return 'chanserv';
  }
  return command;
};
