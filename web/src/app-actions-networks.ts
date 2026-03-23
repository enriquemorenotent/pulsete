import type { NetworkProfile } from '../../shared/protocol.js';
import type { AppDispatch, AppSessionReader, BannerActions } from './app-actions-types.js';
import { selectBuffer } from './app-actions-types.js';
import { api } from './client.js';
import { createAppMutationExecutor } from './app-mutation.js';
import { createConnectionInstancePayload, toSaveNetworkPayload, type NetworkForm } from './network-form.js';

type NetworkActionParams = BannerActions & {
  dispatch: AppDispatch;
  readState: AppSessionReader;
};

export const createNetworkActions = ({
  dispatch,
  readState,
  updateBanner,
}: NetworkActionParams) => {
  const executeMutation = createAppMutationExecutor({ dispatch, readState, updateBanner });

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
      request: () => api.deleteNetwork(network.id),
      mapResult: (result) => result.deletedNetworkIds,
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
    const { conversation } = readState().model;
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
