import { createChatActions } from './app-actions-chat.js';
import { createConversationActions } from './app-actions-conversation.js';
import { createFriendActions } from './app-actions-friends.js';
import { createGatewayActions } from './app-actions-gateway.js';
import { createNetworkActions } from './app-actions-networks.js';
import {
  type AppSessionReader,
  constantReader,
  type AppDispatch,
  type MutableRef,
} from './app-actions-types.js';
import type { AppSessionSnapshot } from './app-session.js';
import type { SocketHandle } from './client.js';

type CreateAppActionsParams = {
  readState: AppSessionReader;
  dispatch: AppDispatch;
  socketRef: MutableRef<SocketHandle | null>;
  recordComposerEntry: (value: string) => void;
  setDraft: (value: string) => void;
  updateBanner: (kind: 'notice' | 'error', message: string) => void;
};

type CreateStaticAppActionsParams = {
  session: AppSessionSnapshot;
  dispatch: AppDispatch;
  socketRef: MutableRef<SocketHandle | null>;
  recordComposerEntry: (value: string) => void;
  setDraft: (value: string) => void;
  updateBanner: (kind: 'notice' | 'error', message: string) => void;
};

const createAppActionsFromStateReader = (params: CreateAppActionsParams) => {
  const gateway = createGatewayActions({
    readState: params.readState,
    socketRef: params.socketRef,
    updateBanner: params.updateBanner,
  });
  const conversation = createConversationActions({
    dispatch: params.dispatch,
    readState: params.readState,
    updateBanner: params.updateBanner,
    ...gateway,
  });
  return {
    ...createNetworkActions({
      dispatch: params.dispatch,
      readState: params.readState,
      updateBanner: params.updateBanner,
    }),
    ...createFriendActions({
      dispatch: params.dispatch,
      readState: params.readState,
      updateBanner: params.updateBanner,
      ...conversation,
    }),
    ...createChatActions({
      dispatch: params.dispatch,
      readState: params.readState,
      updateBanner: params.updateBanner,
      setDraft: params.setDraft,
      recordComposerEntry: params.recordComposerEntry,
      ...gateway,
      ...conversation,
    }),
  };
};

export function createAppActions(params: CreateStaticAppActionsParams) {
  return createAppActionsFromStateReader({
    readState: constantReader(params.session),
    dispatch: params.dispatch,
    socketRef: params.socketRef,
    setDraft: params.setDraft,
    recordComposerEntry: params.recordComposerEntry,
    updateBanner: params.updateBanner,
  });
}

export const createLiveAppActions = (params: CreateAppActionsParams) =>
  createAppActionsFromStateReader(params);

export type AppActions = ReturnType<typeof createAppActions>;
export type ChatActionSet = Pick<
  AppActions,
  | 'addFriend'
  | 'closeBuffer'
  | 'closeChannel'
  | 'closeChannelList'
  | 'joinChannelFromList'
  | 'openChannelList'
  | 'openMentionedChannel'
  | 'removeFriend'
  | 'sendComposer'
>;
export type SidebarActionSet = Pick<
  AppActions,
  | 'addFriend'
  | 'closeBuffer'
  | 'closeChannel'
  | 'closeConnection'
  | 'disconnectNetwork'
  | 'reconnectNetwork'
  | 'removeFriend'
  | 'selectFriend'
  | 'selectNetworkBuffer'
  | 'selectPendingTab'
  | 'selectTabBuffer'
>;
export type NicklistActionSet = Pick<AppActions, 'addFriend' | 'removeFriend' | 'selectPrivateBuffer'>;
export type NetworkManagerActionSet = Pick<
  AppActions,
  'connectNetwork' | 'deleteNetwork' | 'duplicateNetwork' | 'saveFavorite'
>;
export type NetworkEditorActionSet = Pick<AppActions, 'submitNetwork'>;
