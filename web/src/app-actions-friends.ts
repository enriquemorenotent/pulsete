import type { FriendState, NetworkProfile } from '../../shared/protocol-chat.js';
import type { NetworkUserIdentity } from '../../shared/user-identity.js';
import type {
  AppActionContext,
  ConversationActions,
} from './app-actions-types.js';
import { readWorkspace, selectBuffer } from './app-actions-types.js';
import { createAppMutationExecutor } from './app-mutation.js';
import { api } from './client.js';
import { resolveFriendSelection } from './friend-selection.js';

type FriendActionParams = Pick<
  AppActionContext,
  | 'applyServerMessages'
  | 'dispatch'
  | 'getState'
  | 'getWorkspace'
  | 'updateBanner'
> & ConversationActions;

export const createFriendActions = ({
  applyServerMessages,
  dispatch,
  getState,
  getWorkspace,
  openOrSelectQueryBuffer,
  updateBanner,
}: FriendActionParams) => {
  const executeMutation = createAppMutationExecutor({ applyServerMessages, updateBanner });

  const selectPrivateBuffer = async (
    network: NetworkProfile,
    nick: string,
    peerIdentity?: NetworkUserIdentity | null,
  ) => {
    try {
      await openOrSelectQueryBuffer(network, nick, peerIdentity);
    } catch (error) {
      updateBanner('error', error instanceof Error ? error.message : 'Failed to open private message');
    }
  };

  const selectFriend = async (friend: FriendState) => {
    const state = getState();
    const workspace = readWorkspace(getState, getWorkspace);
    const decision = resolveFriendSelection({
      nick: friend.nick,
      buffers: state.domain.buffers,
      workspace,
      networkStates: state.domain.networkStates,
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
      successMessage: 'Added to watchlist',
      errorMessage: 'Failed to update watchlist',
      failureValue: false,
    });
  };

  const removeFriend = async (friendId: string) => {
    return executeMutation({
      request: () => api.removeFriend(friendId),
      mapResult: () => true,
      successMessage: 'Removed from watchlist',
      errorMessage: 'Failed to update watchlist',
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
