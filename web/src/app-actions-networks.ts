import type { NetworkProfile } from '../../shared/protocol.js';
import type { AppDispatch, BannerActions } from './app-actions-types.js';
import { selectBuffer } from './app-actions-types.js';
import { api } from './client.js';
import type { ConversationIndex } from './conversation-selectors.js';
import type { GatewayStatus } from './app-types.js';
import { syncMutationMessages } from './mutation-message-sync.js';
import { createConnectionInstancePayload, toSaveNetworkPayload, type NetworkForm } from './network-form.js';

type NetworkActionParams = BannerActions & {
  conversation: ConversationIndex;
  dispatch: AppDispatch;
  gatewayStatus: GatewayStatus;
};

export const createNetworkActions = ({ conversation, dispatch, gatewayStatus, updateBanner }: NetworkActionParams) => {
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
    try {
      const result = await api.saveNetwork(toSaveNetworkPayload(form));
      syncMutationMessages(gatewayStatus, result.messages, dispatch);
      updateBanner('notice', 'Network saved');
      return result.network;
    } catch (error) {
      updateBanner('error', error instanceof Error ? error.message : 'Failed to save network');
      return null;
    }
  };

  const deleteNetwork = async (networkId: string) => {
    try {
      const result = await api.deleteNetwork(networkId);
      syncMutationMessages(gatewayStatus, result.messages, dispatch);
      updateBanner('notice', 'Network deleted');
      return result.deletedNetworkIds;
    } catch (error) {
      updateBanner('error', error instanceof Error ? error.message : 'Failed to delete network');
      return null;
    }
  };

  const duplicateNetwork = async (network: NetworkProfile) => {
    try {
      const result = await api.duplicateNetwork(network.id);
      syncMutationMessages(gatewayStatus, result.messages, dispatch);
      updateBanner('notice', 'Network duplicated');
      return result.network;
    } catch (error) {
      updateBanner('error', error instanceof Error ? error.message : 'Failed to duplicate network');
      return null;
    }
  };

  const connectNetwork = async (network: NetworkProfile) => {
    try {
      const instance = await api.saveNetwork(createConnectionInstancePayload(network));
      syncMutationMessages(gatewayStatus, instance.messages, dispatch);
      if (instance.serverBuffer) {
        selectBuffer(dispatch, instance.serverBuffer);
      }
      await api.connectNetwork(instance.network.id);
      updateBanner('notice', 'Opened connection instance');
      return true;
    } catch (error) {
      updateBanner('error', error instanceof Error ? error.message : 'Failed to connect');
      return false;
    }
  };

  const reconnectNetwork = async (network: NetworkProfile) => {
    try {
      await api.connectNetwork(network.id);
      updateBanner('notice', 'Reconnect requested');
      return true;
    } catch (error) {
      updateBanner('error', error instanceof Error ? error.message : 'Failed to reconnect');
      return false;
    }
  };

  const disconnectNetwork = async (networkId: string) => {
    try {
      await api.disconnectNetwork(networkId);
      updateBanner('notice', 'Disconnect requested');
      return true;
    } catch (error) {
      updateBanner('error', error instanceof Error ? error.message : 'Failed to disconnect');
      return false;
    }
  };

  const closeConnection = async (network: NetworkProfile) => {
    try {
      const result = await api.deleteNetwork(network.id);
      syncMutationMessages(gatewayStatus, result.messages, dispatch);
      updateBanner('notice', 'Connection instance closed');
      return result.deletedNetworkIds;
    } catch (error) {
      updateBanner('error', error instanceof Error ? error.message : 'Failed to close connection');
      return null;
    }
  };

  const saveFavorite = async (network: NetworkProfile, favorite: boolean) => {
    try {
      const result = await api.saveNetwork({ ...network, favorite });
      syncMutationMessages(gatewayStatus, result.messages, dispatch);
      updateBanner('notice', favorite ? 'Marked as favorite' : 'Removed from favorites');
      return result.network;
    } catch (error) {
      updateBanner('error', error instanceof Error ? error.message : 'Failed to update favorite');
      return null;
    }
  };

  const selectNetworkBuffer = (network: NetworkProfile) => {
    const buffer = conversation.findServerBuffer(network.id);
    if (buffer) {
      selectBuffer(dispatch, buffer);
    }
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
  };
};
