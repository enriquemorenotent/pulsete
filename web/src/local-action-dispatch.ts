import type { BufferState, FriendState, NetworkProfile } from '../../shared/protocol.js';
import type { Action } from './app-types.js';

type Dispatch = (action: Action) => void;

export const dispatchLocalActions = (dispatch: Dispatch, actions: readonly Action[]) => {
  for (const action of actions) {
    dispatch(action);
  }
};

export const dispatchLocalBufferUpsert = (dispatch: Dispatch, buffer: BufferState) => {
  dispatch({ type: 'upsert-buffer', buffer });
};

export const dispatchLocalBufferRemoval = (dispatch: Dispatch, bufferId: string, networkId: string) => {
  dispatch({ type: 'remove-buffer', bufferId, networkId });
};

export const dispatchLocalFriendUpsert = (dispatch: Dispatch, friend: FriendState) => {
  dispatch({ type: 'upsert-friend', friend });
};

export const dispatchLocalFriendRemoval = (dispatch: Dispatch, friendId: string) => {
  dispatch({ type: 'remove-friend', friendId });
};

export const dispatchLocalNetworkUpsert = (dispatch: Dispatch, network: NetworkProfile) => {
  dispatch({ type: 'upsert-network', network });
};

export const dispatchLocalNetworkRemoval = (dispatch: Dispatch, networkId: string) => {
  dispatch({ type: 'remove-network', networkId });
};
