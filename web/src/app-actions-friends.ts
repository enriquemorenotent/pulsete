import type { FriendState, NetworkProfile } from '../../shared/protocol.js';
import type { AppDomainState } from './app-types.js';
import type { AppDispatch, BannerActions, ConversationActions } from './app-actions-types.js';
import { selectBuffer } from './app-actions-types.js';
import { createAppMutationExecutor } from './app-mutation.js';
import { api } from './client.js';
import { resolveFriendSelection } from './friend-selection.js';
import type { WorkspaceView } from './workspace-types.js';

type FriendActionParams = BannerActions & ConversationActions & {
  getBuffers: () => AppDomainState['buffers'];
  dispatch: AppDispatch;
  getGatewayStatus: () => AppDomainState['gatewayStatus'];
  getNetworkStates: () => AppDomainState['networkStates'];
  getWorkspace: () => WorkspaceView;
};

export const createFriendActions = ({
  getBuffers,
  dispatch,
  getGatewayStatus,
  getNetworkStates,
  openOrSelectQueryBuffer,
  updateBanner,
  getWorkspace,
}: FriendActionParams) => {
  const executeMutation = createAppMutationExecutor({ dispatch, getGatewayStatus, updateBanner });

  const selectPrivateBuffer = async (network: NetworkProfile, nick: string) => {
    try {
      await openOrSelectQueryBuffer(network, nick);
    } catch (error) {
      updateBanner('error', error instanceof Error ? error.message : 'Failed to open private message');
    }
  };

  const selectFriend = async (friend: FriendState) => {
    const decision = resolveFriendSelection({
      nick: friend.nick,
      buffers: getBuffers(),
      workspace: getWorkspace(),
      networkStates: getNetworkStates(),
    });

    if (decision.type === 'error') {
      updateBanner('error', decision.message);
      return;
    }

    if (decision.type === 'select') {
      selectBuffer(dispatch, decision.buffer);
      return;
    }

    try {
      await openOrSelectQueryBuffer(decision.network, friend.nick);
    } catch (error) {
      updateBanner('error', error instanceof Error ? error.message : 'Failed to open private message');
    }
  };

  const addFriend = async (nick: string) => {
    return executeMutation({
      request: () => api.addFriend(nick),
      mapResult: () => true,
      successMessage: 'Friend saved',
      errorMessage: 'Failed to save friend',
      failureValue: false,
    });
  };

  const removeFriend = async (friendId: string) => {
    return executeMutation({
      request: () => api.removeFriend(friendId),
      mapResult: () => true,
      successMessage: 'Friend removed',
      errorMessage: 'Failed to remove friend',
      failureValue: false,
    });
  };

  return {
    addFriend,
    removeFriend,
    selectFriend,
    selectPrivateBuffer,
  };
};
