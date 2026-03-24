import { findIrcCaseMatch, isSameIrcIdentifier } from '../../shared/irc-identifiers.js';
import { getNetworkRootId, isSavedNetwork } from '../../shared/network-model.js';
import type { NetworkProfile } from '../../shared/protocol.js';
import type { WorkspaceView } from './workspace-types.js';

export type CurrentChannelAutoJoinState = {
  available: boolean;
  active: boolean;
  network: NetworkProfile | null;
  channel: string | null;
};

const getWorkspaceChannelName = (workspace: WorkspaceView) =>
  workspace.selectedChannel?.name
  ?? workspace.selectedPendingChannel?.channel
  ?? (workspace.selectedBuffer?.kind === 'channel' ? workspace.selectedBuffer.target : null);

const getSavedAutoJoinNetwork = (networks: readonly NetworkProfile[], workspace: WorkspaceView) => {
  if (!workspace.selectedNetwork) {
    return null;
  }
  const rootId = getNetworkRootId(workspace.selectedNetwork);
  return networks.find((network) => isSavedNetwork(network) && network.id === rootId) ?? null;
};

export const resolveCurrentChannelAutoJoinState = (
  networks: readonly NetworkProfile[],
  workspace: WorkspaceView,
): CurrentChannelAutoJoinState => {
  const channel = getWorkspaceChannelName(workspace);
  const network = channel ? getSavedAutoJoinNetwork(networks, workspace) : null;
  return {
    available: Boolean(channel && network),
    active: Boolean(channel && network && findIrcCaseMatch(network.autoJoin, channel)),
    network,
    channel,
  };
};

export const toggleChannelAutoJoin = (network: NetworkProfile, channel: string) => {
  const existing = findIrcCaseMatch(network.autoJoin, channel);
  return existing
    ? network.autoJoin.filter((candidate) => !isSameIrcIdentifier(candidate, channel))
    : [...network.autoJoin, channel];
};
