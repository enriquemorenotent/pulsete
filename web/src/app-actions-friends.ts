import type { FriendState, NetworkProfile } from '../../shared/protocol.js';
import type { AppDomainState } from './app-types.js';
import type { AppDispatch, BannerActions, ConversationActions } from './app-actions-types.js';
import { selectBuffer } from './app-actions-types.js';
import { api } from './client.js';
import { dispatchLocalFriendRemoval, dispatchLocalFriendUpsert } from './local-action-dispatch.js';
import { resolveFriendSelection } from './friend-selection.js';
import type { WorkspaceView } from './workspace-types.js';

type FriendActionParams = BannerActions & ConversationActions & {
  buffers: AppDomainState['buffers'];
  dispatch: AppDispatch;
  networkStates: AppDomainState['networkStates'];
  workspace: WorkspaceView;
};

export const createFriendActions = ({
  buffers,
  dispatch,
  networkStates,
  openOrSelectQueryBuffer,
  updateBanner,
  workspace,
}: FriendActionParams) => {
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
      buffers,
      workspace,
      networkStates,
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
    try {
      const result = await api.addFriend(nick);
      dispatchLocalFriendUpsert(dispatch, result.friend);
      updateBanner('notice', 'Friend saved');
      return true;
    } catch (error) {
      updateBanner('error', error instanceof Error ? error.message : 'Failed to save friend');
      return false;
    }
  };

  const removeFriend = async (friendId: string) => {
    try {
      await api.removeFriend(friendId);
      dispatchLocalFriendRemoval(dispatch, friendId);
      updateBanner('notice', 'Friend removed');
      return true;
    } catch (error) {
      updateBanner('error', error instanceof Error ? error.message : 'Failed to remove friend');
      return false;
    }
  };

  return {
    addFriend,
    removeFriend,
    selectFriend,
    selectPrivateBuffer,
  };
};
