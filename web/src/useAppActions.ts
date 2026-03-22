import type { ConversationIndex } from './conversation-selectors.js';
import { createChatActions } from './app-actions-chat.js';
import { createConversationActions } from './app-actions-conversation.js';
import { createFriendActions } from './app-actions-friends.js';
import { createGatewayActions } from './app-actions-gateway.js';
import { createNetworkActions } from './app-actions-networks.js';
import {
  constantReader,
  type AppActionState,
  type AppDispatch,
  type MutableRef,
  type WorkspaceActions,
} from './app-actions-types.js';
import type { SocketHandle } from './client.js';

type CreateAppActionsParams = AppActionState
  & WorkspaceActions
  & {
      getConversation: () => ConversationIndex;
      getDraft: () => string;
      dispatch: AppDispatch;
      socketRef: MutableRef<SocketHandle | null>;
      recordComposerEntry: (value: string) => void;
      setDraft: (value: string) => void;
      updateBanner: (kind: 'notice' | 'error', message: string) => void;
    };

type CreateStaticAppActionsParams = {
  buffers: ReturnType<CreateAppActionsParams['getBuffers']>;
  channelList: ReturnType<CreateAppActionsParams['getChannelList']>;
  conversation: ConversationIndex;
  draft: string;
  gatewayStatus: ReturnType<CreateAppActionsParams['getGatewayStatus']>;
  networks: ReturnType<CreateAppActionsParams['getNetworks']>;
  networkStates: ReturnType<CreateAppActionsParams['getNetworkStates']>;
  workspace: ReturnType<WorkspaceActions['getWorkspace']>;
  dispatch: AppDispatch;
  socketRef: MutableRef<SocketHandle | null>;
  recordComposerEntry: (value: string) => void;
  setDraft: (value: string) => void;
  updateBanner: (kind: 'notice' | 'error', message: string) => void;
};

const createAppActionsFromReaders = (params: CreateAppActionsParams) => {
  const gateway = createGatewayActions({
    getGatewayStatus: params.getGatewayStatus,
    socketRef: params.socketRef,
    updateBanner: params.updateBanner,
  });
  const conversation = createConversationActions({
    dispatch: params.dispatch,
    getChannelList: params.getChannelList,
    getConversation: params.getConversation,
    getGatewayStatus: params.getGatewayStatus,
    getNetworkStates: params.getNetworkStates,
    updateBanner: params.updateBanner,
    ...gateway,
  });
  return {
    ...createNetworkActions({
      dispatch: params.dispatch,
      getConversation: params.getConversation,
      getGatewayStatus: params.getGatewayStatus,
      updateBanner: params.updateBanner,
    }),
    ...createFriendActions({
      dispatch: params.dispatch,
      getBuffers: params.getBuffers,
      getGatewayStatus: params.getGatewayStatus,
      getNetworkStates: params.getNetworkStates,
      updateBanner: params.updateBanner,
      getWorkspace: params.getWorkspace,
      ...conversation,
    }),
    ...createChatActions({
      dispatch: params.dispatch,
      getChannelList: params.getChannelList,
      getConversation: params.getConversation,
      getDraft: params.getDraft,
      getGatewayStatus: params.getGatewayStatus,
      getNetworks: params.getNetworks,
      getWorkspace: params.getWorkspace,
      updateBanner: params.updateBanner,
      setDraft: params.setDraft,
      recordComposerEntry: params.recordComposerEntry,
      ...gateway,
      ...conversation,
    }),
  };
};

export function createAppActions(params: CreateStaticAppActionsParams) {
  return createAppActionsFromReaders({
    getBuffers: constantReader(params.buffers),
    getChannelList: constantReader(params.channelList),
    getConversation: constantReader(params.conversation),
    getDraft: constantReader(params.draft),
    getGatewayStatus: constantReader(params.gatewayStatus),
    getNetworks: constantReader(params.networks),
    getNetworkStates: constantReader(params.networkStates),
    getWorkspace: constantReader(params.workspace),
    dispatch: params.dispatch,
    socketRef: params.socketRef,
    setDraft: params.setDraft,
    recordComposerEntry: params.recordComposerEntry,
    updateBanner: params.updateBanner,
  });
}

export const createLiveAppActions = (params: CreateAppActionsParams) =>
  createAppActionsFromReaders(params);

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
