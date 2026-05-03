import type { BufferState, NetworkProfile } from '../../shared/protocol-chat.js';
import { isSameIrcIdentifier } from '../../shared/irc-identifiers.js';
import type { AppDomainState } from './app-types.js';
import type { NetworkRuntimeState, WorkspaceView } from './workspace.js';

type FriendSelectionInput = {
  nick: string;
  buffers: AppDomainState['buffers'];
  workspace: Pick<WorkspaceView, 'workspaceNetworks' | 'selectedNetwork'>;
  networkStates: Record<string, NetworkRuntimeState>;
};

export type FriendSelectionDecision =
  | { type: 'select'; buffer: BufferState }
  | { type: 'open'; network: NetworkProfile }
  | { type: 'error'; message: string };

export const resolveFriendSelection = (input: FriendSelectionInput): FriendSelectionDecision => {
  const selectedNetwork = input.workspace.selectedNetwork;
  const existingOnSelected =
    selectedNetwork && isConnected(input.networkStates[selectedNetwork.id])
      ? findQueryBuffer(input.buffers, selectedNetwork.id, input.nick)
      : null;

  if (existingOnSelected) {
    return { type: 'select', buffer: existingOnSelected };
  }

  if (selectedNetwork && isConnected(input.networkStates[selectedNetwork.id])) {
    return { type: 'open', network: selectedNetwork };
  }

  for (const network of input.workspace.workspaceNetworks) {
    if (!isConnected(input.networkStates[network.id])) {
      continue;
    }
    const existing = findQueryBuffer(input.buffers, network.id, input.nick);
    if (existing) {
      return { type: 'select', buffer: existing };
    }
  }

  for (const network of input.workspace.workspaceNetworks) {
    if (isConnected(input.networkStates[network.id])) {
      return { type: 'open', network };
    }
  }

  return { type: 'error', message: 'Connect a network before opening a watchlist conversation' };
};

const isConnected = (runtime: NetworkRuntimeState | null | undefined) => runtime?.phase === 'connected';

const findQueryBuffer = (buffers: BufferState[], networkId: string, nick: string) =>
  buffers.find(
    (buffer) =>
      buffer.networkId === networkId &&
      buffer.kind === 'query' &&
      isSameIrcIdentifier(buffer.target, nick)
  ) ?? null;
