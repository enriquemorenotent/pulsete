import { getNetworkRootId, listConnectionPeers } from '../../shared/network-model.js';
import type { NetworkProfile } from '../../shared/protocol.js';
import type {
  AppActionContext,
} from './app-actions-types.js';
import {
  readConversation,
  readWorkspace,
  selectBuffer,
} from './app-actions-types.js';
import type { State } from './app-types.js';
import { api } from './client.js';
import { createAppMutationExecutor } from './app-mutation.js';
import { resolveCurrentChannelAutoJoinState, toggleChannelAutoJoin } from './channel-autojoin.js';
import { createConnectionInstancePayload, toSaveNetworkPayload, type NetworkForm } from './network-form.js';

type NetworkActionParams = Pick<
  AppActionContext,
  | 'applyServerMessages'
  | 'dispatch'
  | 'getConversation'
  | 'getState'
  | 'getWorkspace'
  | 'updateBanner'
>;

export type ManagedNetworkConnectPlan =
  | { kind: 'noop-connected' }
  | { kind: 'noop-connecting' }
  | { kind: 'reconnect-existing-peer'; peer: NetworkProfile }
  | { kind: 'create-new-peer' };

export const resolveManagedNetworkConnectPlan = ({
  network,
  networks,
  networkStates,
}: {
  network: NetworkProfile;
  networks: readonly NetworkProfile[];
  networkStates: State['domain']['networkStates'];
}): ManagedNetworkConnectPlan => {
  const peers = listConnectionPeers(networks, getNetworkRootId(network));
  const openPeers = peers.filter((peer) => peer.connectionClosed !== true);
  if (openPeers.some((peer) => networkStates[peer.id]?.phase === 'connected')) {
    return { kind: 'noop-connected' };
  }
  if (openPeers.some((peer) => networkStates[peer.id]?.phase === 'connecting')) {
    return { kind: 'noop-connecting' };
  }
  const existingPeer = peers[0];
  return existingPeer
    ? { kind: 'reconnect-existing-peer', peer: existingPeer }
    : { kind: 'create-new-peer' };
};

export const createNetworkActions = ({
  applyServerMessages,
  dispatch,
  getConversation,
  getState,
  getWorkspace,
  updateBanner,
}: NetworkActionParams) => {
  const executeMutation = createAppMutationExecutor({ applyServerMessages, updateBanner });

  const submitNetwork = async (form: NetworkForm) => {
    if (!form.name.trim()) {
      updateBanner('error', 'Network name is required');
      return null;
    }
    if (!form.host.trim()) {
      updateBanner('error', 'Server address is required');
      return null;
    }
    if (!form.nick.trim()) {
      updateBanner('error', 'Nick name is required');
      return null;
    }
    return executeMutation({
      request: () => api.saveNetwork(toSaveNetworkPayload(form)),
      mapResult: (result) => result.network,
      successMessage: 'Network saved',
      errorMessage: 'Failed to save network',
      failureValue: null,
    });
  };

  const deleteNetwork = async (networkId: string) => {
    return executeMutation({
      request: () => api.deleteNetwork(networkId),
      mapResult: (result) => result.deletedNetworkIds,
      successMessage: 'Network deleted',
      errorMessage: 'Failed to delete network',
      failureValue: null,
    });
  };

  const duplicateNetwork = async (network: NetworkProfile) => {
    return executeMutation({
      request: () => api.duplicateNetwork(network.id),
      mapResult: (result) => result.network,
      successMessage: 'Network duplicated',
      errorMessage: 'Failed to duplicate network',
      failureValue: null,
    });
  };

  const connectNetwork = async (network: NetworkProfile) => {
    const state = getState();
    const conversation = readConversation(getState, getConversation);
    const plan = resolveManagedNetworkConnectPlan({
      network,
      networks: state.domain.networks,
      networkStates: state.domain.networkStates,
    });
    if (plan.kind === 'noop-connected' || plan.kind === 'noop-connecting') {
      return false;
    }
    if (plan.kind === 'reconnect-existing-peer') {
      return executeMutation({
        request: () => api.connectNetwork(plan.peer.id),
        onSuccess: () => {
          const buffer = conversation.findServerBuffer(plan.peer.id);
          if (buffer) {
            selectBuffer(dispatch, buffer);
          }
        },
        mapResult: () => true,
        successMessage: 'Reconnect requested',
        errorMessage: 'Failed to reconnect',
        failureValue: false,
      });
    }
    return executeMutation({
      request: async () => {
        const instance = await api.saveNetwork(createConnectionInstancePayload(network));
        await api.connectNetwork(instance.network.id);
        return { instance, messages: instance.messages };
      },
      onSuccess: ({ instance }) => {
        if (instance.serverBuffer) {
          selectBuffer(dispatch, instance.serverBuffer);
        }
      },
      mapResult: () => true,
      successMessage: 'Opened connection instance',
      errorMessage: 'Failed to connect',
      failureValue: false,
    });
  };

  const reconnectNetwork = async (network: NetworkProfile) => {
    return executeMutation({
      request: () => api.connectNetwork(network.id),
      mapResult: () => true,
      successMessage: 'Reconnect requested',
      errorMessage: 'Failed to reconnect',
      failureValue: false,
    });
  };

  const disconnectNetwork = async (networkId: string) => {
    return executeMutation({
      request: () => api.disconnectNetwork(networkId),
      mapResult: () => true,
      successMessage: 'Disconnect requested',
      errorMessage: 'Failed to disconnect',
      failureValue: false,
    });
  };

  const closeConnection = async (network: NetworkProfile) => {
    return executeMutation({
      request: () => api.closeConnection(network.id),
      mapResult: (result) => result.network,
      successMessage: 'Connection instance closed',
      errorMessage: 'Failed to close connection',
      failureValue: null,
    });
  };

  const saveFavorite = async (network: NetworkProfile, favorite: boolean) => {
    return executeMutation({
      request: () => api.saveNetwork({ ...network, favorite }),
      mapResult: (result) => result.network,
      successMessage: favorite ? 'Marked as favorite' : 'Removed from favorites',
      errorMessage: 'Failed to update favorite',
      failureValue: null,
    });
  };

  const selectNetworkBuffer = (network: NetworkProfile) => {
    const conversation = readConversation(getState, getConversation);
    const buffer = conversation.findServerBuffer(network.id);
    if (buffer) {
      selectBuffer(dispatch, buffer);
    }
  };

  const toggleCurrentChannelAutoJoin = async () => {
    const state = getState();
    const workspace = readWorkspace(getState, getWorkspace);
    const autoJoin = resolveCurrentChannelAutoJoinState(state.domain.networks, workspace);
    if (!autoJoin.network || !autoJoin.channel) {
      return false;
    }
    const nextAutoJoin = toggleChannelAutoJoin(autoJoin.network, autoJoin.channel);
    const nextActive = nextAutoJoin.length > autoJoin.network.autoJoin.length;
    return executeMutation({
      request: () => api.saveNetwork({ ...autoJoin.network, autoJoin: nextAutoJoin }),
      mapResult: () => nextActive,
      successMessage: nextActive
        ? `Added ${autoJoin.channel} to autojoin`
        : `Removed ${autoJoin.channel} from autojoin`,
      errorMessage: 'Failed to update autojoin',
      failureValue: false,
    });
  };

  return {
    closeConnection,
    connectNetwork,
    deleteNetwork,
    disconnectNetwork,
    duplicateNetwork,
    reconnectNetwork,
    saveFavorite,
    selectNetworkBuffer,
    submitNetwork,
    toggleCurrentChannelAutoJoin,
  };
};
