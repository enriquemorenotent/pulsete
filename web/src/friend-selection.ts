import type { BufferState, NetworkProfile } from '../../shared/protocol.js';
import { isSameIrcIdentifier } from '../../shared/irc-identifiers.js';
import type { State } from './app-types.js';
import type { NetworkRuntimeState, WorkspaceView } from './workspace.js';

type FriendSelectionInput = {
  nick: string;
  buffers: State['buffers'];
  workspace: Pick<WorkspaceView, 'connectionInstances' | 'selectedNetwork'>;
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

  for (const network of input.workspace.connectionInstances) {
    if (!isConnected(input.networkStates[network.id])) {
      continue;
    }
    const existing = findQueryBuffer(input.buffers, network.id, input.nick);
    if (existing) {
      return { type: 'select', buffer: existing };
    }
  }

  for (const network of input.workspace.connectionInstances) {
    if (isConnected(input.networkStates[network.id])) {
      return { type: 'open', network };
    }
  }

  return { type: 'error', message: 'Connect a network before opening a friend conversation' };
};

const isConnected = (runtime: NetworkRuntimeState | null | undefined) => runtime?.phase === 'connected';

const findQueryBuffer = (buffers: BufferState[], networkId: string, nick: string) =>
  buffers.find(
    (buffer) =>
      buffer.networkId === networkId &&
      buffer.kind === 'query' &&
      isSameIrcIdentifier(buffer.target, nick)
  ) ?? null;
