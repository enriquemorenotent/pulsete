import type { FriendState, NetworkProfile } from '../../shared/protocol.js';
import { selectBuffer, type AppActionContext } from './app-actions-types.js';
import { api } from './client.js';
import { resolveFriendSelection } from './friend-selection.js';

export const createFriendActions = (context: AppActionContext) => {
  const selectPrivateBuffer = async (network: NetworkProfile, nick: string) => {
    try {
      await context.openOrSelectQueryBuffer(network, nick);
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to open private message');
    }
  };

  const selectFriend = async (friend: FriendState) => {
    const decision = resolveFriendSelection({
      nick: friend.nick,
      buffers: context.state.buffers,
      workspace: context.workspace,
      networkStates: context.state.networkStates,
    });

    if (decision.type === 'error') {
      context.updateBanner('error', decision.message);
      return;
    }

    if (decision.type === 'select') {
      selectBuffer(context.dispatch, decision.buffer);
      return;
    }

    try {
      await context.openOrSelectQueryBuffer(decision.network, friend.nick);
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to open private message');
    }
  };

  const addFriend = async (nick: string) => {
    try {
      const result = await api.addFriend(nick);
      context.dispatch({ type: 'upsert-friend', friend: result.friend });
      context.updateBanner('notice', 'Friend saved');
      return true;
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to save friend');
      return false;
    }
  };

  const removeFriend = async (friendId: string) => {
    try {
      await api.removeFriend(friendId);
      context.dispatch({ type: 'remove-friend', friendId });
      context.updateBanner('notice', 'Friend removed');
      return true;
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to remove friend');
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
