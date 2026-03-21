import type { NetworkProfile } from '../../shared/protocol.js';
import { selectBuffer, type AppActionContext } from './app-actions-types.js';
import { api } from './client.js';
import { createConnectionInstancePayload, toForm, toSaveNetworkPayload, type NetworkForm } from './network-form.js';

export const createNetworkActions = (context: AppActionContext) => {
  const submitNetwork = async (form: NetworkForm) => {
    if (!form.name.trim()) {
      context.updateBanner('error', 'Network name is required');
      return null;
    }
    if (!form.host.trim()) {
      context.updateBanner('error', 'Server address is required');
      return null;
    }
    if (!form.nick.trim()) {
      context.updateBanner('error', 'Nick name is required');
      return null;
    }
    try {
      const result = await api.saveNetwork(toSaveNetworkPayload(form));
      context.dispatch({ type: 'upsert-network', network: result.network });
      if (result.serverBuffer) {
        context.dispatch({ type: 'upsert-buffer', buffer: result.serverBuffer });
      }
      context.dispatch({ type: 'reset-network-form', form: toForm(result.network) });
      context.updateBanner('notice', 'Network saved');
      return result.network;
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to save network');
      return null;
    }
  };

  const deleteNetwork = async (networkId: string) => {
    try {
      const result = await api.deleteNetwork(networkId);
      for (const deletedNetworkId of result.deletedNetworkIds) {
        context.dispatch({ type: 'remove-network', networkId: deletedNetworkId });
      }
      context.updateBanner('notice', 'Network deleted');
      return result.deletedNetworkIds;
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to delete network');
      return null;
    }
  };

  const duplicateNetwork = async (network: NetworkProfile) => {
    try {
      const result = await api.duplicateNetwork(network.id);
      context.dispatch({ type: 'upsert-network', network: result.network });
      context.updateBanner('notice', 'Network duplicated');
      return result.network;
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to duplicate network');
      return null;
    }
  };

  const connectNetwork = async (network: NetworkProfile) => {
    try {
      const instance = await api.saveNetwork(createConnectionInstancePayload(network));
      context.dispatch({ type: 'upsert-network', network: instance.network });
      if (instance.serverBuffer) {
        context.dispatch({ type: 'upsert-buffer', buffer: instance.serverBuffer });
        selectBuffer(context.dispatch, instance.serverBuffer);
      }
      await api.connectNetwork(instance.network.id);
      context.updateBanner('notice', 'Opened connection instance');
      return true;
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to connect');
      return false;
    }
  };

  const reconnectNetwork = async (network: NetworkProfile) => {
    try {
      await api.connectNetwork(network.id);
      context.updateBanner('notice', 'Reconnect requested');
      return true;
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to reconnect');
      return false;
    }
  };

  const disconnectNetwork = async (networkId: string) => {
    try {
      await api.disconnectNetwork(networkId);
      context.updateBanner('notice', 'Disconnect requested');
      return true;
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to disconnect');
      return false;
    }
  };

  const closeConnection = async (network: NetworkProfile) => {
    try {
      const result = await api.deleteNetwork(network.id);
      for (const deletedNetworkId of result.deletedNetworkIds) {
        context.dispatch({ type: 'remove-network', networkId: deletedNetworkId });
      }
      context.updateBanner('notice', 'Connection instance closed');
      return result.deletedNetworkIds;
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to close connection');
      return null;
    }
  };

  const saveFavorite = async (network: NetworkProfile, favorite: boolean) => {
    try {
      const result = await api.saveNetwork({ ...network, favorite });
      context.dispatch({ type: 'upsert-network', network: result.network });
      if (result.serverBuffer) {
        context.dispatch({ type: 'upsert-buffer', buffer: result.serverBuffer });
      }
      context.updateBanner('notice', favorite ? 'Marked as favorite' : 'Removed from favorites');
      return result.network;
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to update favorite');
      return null;
    }
  };

  const selectNetworkBuffer = (network: NetworkProfile) => {
    const buffer = context.conversation.findServerBuffer(network.id);
    if (buffer) {
      selectBuffer(context.dispatch, buffer);
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
