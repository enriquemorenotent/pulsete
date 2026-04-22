import type { BufferState } from '../../shared/protocol.js';
import type { SocketHandle } from './client.js';
import type { WorkspaceView } from './workspace-types.js';
import { parseSlashIrcClientCommand } from '../../shared/irc-client-command.js';

const isChannelTarget = (value: string) => /^[#&+!]/.test(value);

type ComposerParams = {
  draft: string;
  setDraft: (value: string) => void;
  socket: SocketHandle | null;
  updateBanner: (kind: 'notice' | 'error', message: string) => void;
  workspace: WorkspaceView;
  onJoinChannel: (networkId: string, channel: string, sourceBufferId?: string) => Promise<void>;
  onOpenChannelList: (networkId: string) => Promise<void>;
  onOpenQuery: (networkId: string, nick: string) => Promise<void>;
  onCloseChannel: (networkId: string, channel: string) => void;
  onCloseBuffer: (buffer: BufferState) => Promise<void>;
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
    sourceBufferId: selection.id,
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
  const parsed = parseSlashIrcClientCommand(text);
  if (!parsed) {
    return null;
  }
  const { name: command, args, remainder } = parsed;

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
      await params.onJoinChannel(selection.networkId, remainder, selection.id);
      break;
    case 'part': {
      const channel = remainder || selection.target;
      socket.send({ type: 'channel.part', networkId: selection.networkId, channel, sourceBufferId: selection.id });
      break;
    }
    case 'msg': {
      if (!remainder) {
        params.updateBanner('error', 'Usage: /msg target text');
        return null;
      }
      const [target, ...messageParts] = args;
      const body = messageParts.join(' ').trim();
      if (!target || !body) {
        params.updateBanner('error', 'Usage: /msg target text');
        return null;
      }
      socket.send({
        type: 'message.send',
        networkId: selection.networkId,
        target,
        body,
        kind: 'message',
        sourceBufferId: selection.id,
      });
      break;
    }
    case 'query':
      if (!remainder) {
        params.updateBanner('error', 'Usage: /query nick');
        return null;
      }
      await params.onOpenQuery(selection.networkId, remainder);
      break;
    case 'list':
      if (remainder) {
        params.updateBanner('error', 'Usage: /list');
        return null;
      }
      await params.onOpenChannelList(selection.networkId);
      break;
    case 'close':
      if (remainder) {
        params.updateBanner('error', 'Usage: /close');
        return null;
      }
      if (selection.kind === 'channel') {
        params.onCloseChannel(selection.networkId, selection.target);
        break;
      }
      if (selection.kind === 'query') {
        await params.onCloseBuffer(selection);
        break;
      }
      params.updateBanner('error', 'Only channels and private messages can be closed with /close');
      return null;
    case 'whois':
      if (!remainder) {
        params.updateBanner('error', 'Usage: /whois nick');
        return null;
      }
      socket.send({ type: 'raw.send', networkId: selection.networkId, raw: `WHOIS ${remainder}`, sourceBufferId: selection.id });
      break;
    case 'nickserv':
      if (!remainder) {
        params.updateBanner('error', 'Usage: /ns command');
        return null;
      }
      socket.send({
        type: 'message.send',
        networkId: selection.networkId,
        target: 'NickServ',
        body: remainder,
        kind: 'message',
        sourceBufferId: selection.id,
      });
      break;
    case 'chanserv':
      if (!remainder) {
        params.updateBanner('error', 'Usage: /cs command');
        return null;
      }
      socket.send({
        type: 'message.send',
        networkId: selection.networkId,
        target: 'ChanServ',
        body: remainder,
        kind: 'message',
        sourceBufferId: selection.id,
      });
      break;
    case 'hostserv':
      if (!remainder) {
        params.updateBanner('error', 'Usage: /hs command');
        return null;
      }
      socket.send({
        type: 'message.send',
        networkId: selection.networkId,
        target: 'HostServ',
        body: remainder,
        kind: 'message',
        sourceBufferId: selection.id,
      });
      break;
    case 'me':
      if (!remainder) {
        params.updateBanner('error', 'Usage: /me action');
        return null;
      }
      socket.send({
        type: 'message.send',
        networkId: selection.networkId,
        target: selection.target,
        body: remainder,
        kind: 'action',
        sourceBufferId: selection.id,
      });
      break;
    case 'nick':
      if (!remainder) {
        params.updateBanner('error', 'Usage: /nick newnick');
        return null;
      }
      socket.send({ type: 'raw.send', networkId: selection.networkId, raw: `NICK ${remainder}`, sourceBufferId: selection.id });
      break;
    case 'topic':
      if (!remainder) {
        params.updateBanner('error', 'Usage: /topic text');
        return null;
      }
      socket.send({
        type: 'raw.send',
        networkId: selection.networkId,
        raw: `TOPIC ${selection.target} :${remainder}`,
        sourceBufferId: selection.id,
      });
      break;
    case 'raw':
      if (!remainder) {
        params.updateBanner('error', 'Usage: /raw IRC line');
        return null;
      }
      socket.send({ type: 'raw.send', networkId: selection.networkId, raw: remainder, sourceBufferId: selection.id });
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
