import type { NetworkProfile } from '../../shared/protocol.js';
import { selectBuffer, type AppActionContext } from './app-actions-types.js';
import { api } from './client.js';
import { createConnectionInstancePayload, parseAutoJoin, toForm } from './network-form.js';
import { openExistingNetworkEditor, openNewNetworkEditor } from './network-editor-actions.js';

export const createNetworkActions = (context: AppActionContext) => {
  const openNewNetworkEditorAction = () => openNewNetworkEditor(context);
  const openNetworkEditor = (network: NetworkProfile) => openExistingNetworkEditor(network, context);

  const submitNetwork = async () => {
    if (!context.state.networkForm.name.trim()) return context.updateBanner('error', 'Network name is required');
    if (!context.state.networkForm.host.trim()) return context.updateBanner('error', 'Server address is required');
    if (!context.state.networkForm.nick.trim()) return context.updateBanner('error', 'Nick name is required');
    try {
      const result = await api.saveNetwork({
        id: context.state.networkForm.id,
        name: context.state.networkForm.name.trim(),
        host: context.state.networkForm.host.trim(),
        port: Number(context.state.networkForm.port),
        tls: context.state.networkForm.tls,
        nick: context.state.networkForm.nick.trim(),
        altNicks: [context.state.networkForm.nick2.trim(), context.state.networkForm.nick3.trim()].filter(Boolean),
        username: context.state.networkForm.username.trim() || context.state.networkForm.nick.trim(),
        realName: context.state.networkForm.realName.trim() || context.state.networkForm.nick.trim(),
        password: context.state.networkForm.password.trim() || undefined,
        clearPassword: context.state.networkForm.password.trim()
          ? false
          : context.state.networkForm.clearPassword || undefined,
        favorite: context.state.networkForm.favorite,
        autoJoin: parseAutoJoin(context.state.networkForm.autoJoin),
      });
      context.dispatch({ type: 'upsert-network', network: result.network });
      if (result.serverBuffer) {
        context.dispatch({ type: 'upsert-buffer', buffer: result.serverBuffer });
      }
      context.dispatch({ type: 'reset-network-form', form: toForm(result.network) });
      context.setManagedNetworkId(result.network.id);
      context.setShowNetworkEditor(false);
      context.setShowNetworkManager(true);
      context.updateBanner('notice', 'Network saved');
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to save network');
    }
  };

  const deleteNetwork = async (networkId: string) => {
    try {
      const result = await api.deleteNetwork(networkId);
      for (const deletedNetworkId of result.deletedNetworkIds) {
        context.dispatch({ type: 'remove-network', networkId: deletedNetworkId });
      }
      context.updateBanner('notice', 'Network deleted');
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to delete network');
    }
  };

  const duplicateNetwork = async (network: NetworkProfile) => {
    try {
      const result = await api.duplicateNetwork(network.id);
      context.dispatch({ type: 'upsert-network', network: result.network });
      context.setManagedNetworkId(result.network.id);
      context.updateBanner('notice', 'Network duplicated');
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to duplicate network');
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
      context.setShowNetworkManager(false);
      context.updateBanner('notice', 'Opened connection instance');
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to connect');
    }
  };

  const reconnectNetwork = async (network: NetworkProfile) => {
    try {
      await api.connectNetwork(network.id);
      context.updateBanner('notice', 'Reconnect requested');
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to reconnect');
    }
  };

  const disconnectNetwork = async (networkId: string) => {
    try {
      await api.disconnectNetwork(networkId);
      context.updateBanner('notice', 'Disconnect requested');
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to disconnect');
    }
  };

  const closeConnection = async (network: NetworkProfile) => {
    try {
      const result = await api.deleteNetwork(network.id);
      for (const deletedNetworkId of result.deletedNetworkIds) {
        context.dispatch({ type: 'remove-network', networkId: deletedNetworkId });
      }
      context.updateBanner('notice', 'Connection instance closed');
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to close connection');
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
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to update favorite');
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
    openNetworkEditor,
    openNewNetworkEditor: openNewNetworkEditorAction,
    reconnectNetwork,
    saveFavorite,
    selectNetworkBuffer,
    submitNetwork,
  };
};
