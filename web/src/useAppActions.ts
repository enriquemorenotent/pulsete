import { createChatActions } from './app-actions-chat.js';
import { createConversationActions } from './app-actions-conversation.js';
import { createFriendActions } from './app-actions-friends.js';
import { createGatewayActions } from './app-actions-gateway.js';
import { createNetworkActions } from './app-actions-networks.js';
import {
  type ApplyServerMessages,
  type AppSessionReader,
  constantReader,
  type AppDispatch,
  type MutableRef,
} from './app-actions-types.js';
import type { AppSessionSnapshot } from './app-session.js';
import type { SocketHandle } from './client.js';
import { createServerMessageBridge } from './server-message-bridge.js';

type CreateAppActionsParams = {
  applyServerMessages: ApplyServerMessages;
  readState: AppSessionReader;
  dispatch: AppDispatch;
  socketRef: MutableRef<SocketHandle | null>;
  recordComposerEntry: (value: string) => void;
  setDraft: (value: string) => void;
  updateBanner: (kind: 'notice' | 'error', message: string) => void;
};

type CreateStaticAppActionsParams = {
  applyServerMessages?: ApplyServerMessages;
  session: AppSessionSnapshot;
  dispatch: AppDispatch;
  socketRef: MutableRef<SocketHandle | null>;
  recordComposerEntry: (value: string) => void;
  setDraft: (value: string) => void;
  updateBanner: (kind: 'notice' | 'error', message: string) => void;
};

const createAppActionsFromStateReader = (params: CreateAppActionsParams) => {
  const readDraft = () => params.readState().draft;
  const readConversation = () => params.readState().conversation;
  const readWorkspace = () => params.readState().workspace;
  const readGatewayStatus = () => params.readState().state.domain.gatewayStatus;
  const readChannelList = () => params.readState().state.transient.channelList;
  const readNetworks = () => params.readState().state.domain.networks;
  const readNetworkStates = () => params.readState().state.domain.networkStates;
  const readFriendSelection = () => ({
    buffers: params.readState().state.domain.buffers,
    networkStates: params.readState().state.domain.networkStates,
    workspace: params.readState().workspace,
  });
  const gateway = createGatewayActions({
    readGatewayStatus,
    socketRef: params.socketRef,
    updateBanner: params.updateBanner,
  });
  const conversation = createConversationActions({
    applyServerMessages: params.applyServerMessages,
    dispatch: params.dispatch,
    readChannelList,
    readConversation,
    readNetworkStates,
    updateBanner: params.updateBanner,
    ...gateway,
  });
  return {
    ...createNetworkActions({
      applyServerMessages: params.applyServerMessages,
      dispatch: params.dispatch,
      readConversation,
      updateBanner: params.updateBanner,
    }),
    ...createFriendActions({
      applyServerMessages: params.applyServerMessages,
      dispatch: params.dispatch,
      readFriendSelection,
      updateBanner: params.updateBanner,
      ...conversation,
    }),
    ...createChatActions({
      applyServerMessages: params.applyServerMessages,
      dispatch: params.dispatch,
      readChannelList,
      readConversation,
      readDraft,
      readNetworks,
      readWorkspace,
      updateBanner: params.updateBanner,
      setDraft: params.setDraft,
      recordComposerEntry: params.recordComposerEntry,
      ...gateway,
      ...conversation,
    }),
  };
};

export function createAppActions(params: CreateStaticAppActionsParams) {
  const applyServerMessages =
    params.applyServerMessages ?? createServerMessageBridge(params.dispatch).applyMutationMessages;
  return createAppActionsFromStateReader({
    applyServerMessages,
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
