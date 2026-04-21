import { createAssistantActions } from './app-actions-assistant.js';
import { createChatActions } from './app-actions-chat.js';
import { createConversationActions } from './app-actions-conversation.js';
import { createFriendActions } from './app-actions-friends.js';
import { createGatewayActions } from './app-actions-gateway.js';
import { createMutedNickActions } from './app-actions-muted-nicks.js';
import { createNetworkActions } from './app-actions-networks.js';
import {
  type AppActionContext,
  type ApplyServerMessages,
  type AppDispatch,
  type MutableRef,
} from './app-actions-types.js';
import type { AppSessionSnapshot } from './app-session.js';
import type { SocketHandle } from './client.js';
import { createServerMessageBridge } from './server-message-bridge.js';

type CreateAppActionsParams = {
  applyServerMessages: ApplyServerMessages;
  getSession: AppActionContext['getSession'];
  dispatch: AppDispatch;
  socketRef: MutableRef<SocketHandle | null>;
  recordComposerEntry: AppActionContext['recordComposerEntry'];
  setDraft: AppActionContext['setDraft'];
  updateBanner: (kind: 'notice' | 'error', message: string) => void;
};

type CreateStaticAppActionsParams = {
  applyServerMessages?: ApplyServerMessages;
  session: AppSessionSnapshot;
  dispatch: AppDispatch;
  socketRef: MutableRef<SocketHandle | null>;
  recordComposerEntry: AppActionContext['recordComposerEntry'];
  setDraft: AppActionContext['setDraft'];
  updateBanner: (kind: 'notice' | 'error', message: string) => void;
};

const createAppActionsFromSession = (params: CreateAppActionsParams) => {
  const actionContext: AppActionContext = {
    getSession: params.getSession,
    applyServerMessages: params.applyServerMessages,
    dispatch: params.dispatch,
    socketRef: params.socketRef,
    setDraft: params.setDraft,
    recordComposerEntry: params.recordComposerEntry,
    updateBanner: params.updateBanner,
  };
  const gateway = createGatewayActions({
    getSession: params.getSession,
    socketRef: params.socketRef,
    updateBanner: params.updateBanner,
  });
  const conversation = createConversationActions({
    ...actionContext,
    ...gateway,
  });
  const mutedNickActions = createMutedNickActions({
    ...actionContext,
  });
  return {
    ...createAssistantActions({
      ...actionContext,
    }),
    ...createNetworkActions({
      ...actionContext,
    }),
    ...createFriendActions({
      ...actionContext,
      ...conversation,
    }),
    ...mutedNickActions,
    ...createChatActions({
      ...actionContext,
      ...gateway,
      ...conversation,
    }),
  };
};

export function createAppActions(params: CreateStaticAppActionsParams) {
  const applyServerMessages =
    params.applyServerMessages ??
    createServerMessageBridge(params.dispatch).applyMutationMessages;
  return createAppActionsFromSession({
    applyServerMessages,
    getSession: () => params.session,
    dispatch: params.dispatch,
    socketRef: params.socketRef,
    setDraft: params.setDraft,
    recordComposerEntry: params.recordComposerEntry,
    updateBanner: params.updateBanner,
  });
}

export const createLiveAppActions = (params: CreateAppActionsParams) =>
  createAppActionsFromSession(params);

export type AppActions = ReturnType<typeof createAppActions>;
export type ChatActionSet = Pick<
  AppActions,
  | 'addFriend'
  | 'addMutedNick'
  | 'closeBuffer'
  | 'clearBufferHistory'
  | 'closeChannel'
  | 'closeChannelList'
  | 'downloadBufferHistory'
  | 'importBufferHistory'
  | 'updateBufferSelfNickAliases'
  | 'joinChannelFromList'
  | 'openChannelList'
  | 'openMentionedChannel'
  | 'reconnectNetwork'
  | 'removeFriend'
  | 'removeMutedNick'
  | 'requestWhois'
  | 'selectPrivateBuffer'
  | 'sendComposer'
  | 'toggleCurrentChannelAutoJoin'
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
export type NicklistActionSet = Pick<
  AppActions,
  'addFriend' | 'addMutedNick' | 'removeFriend' | 'removeMutedNick' | 'selectPrivateBuffer'
>;
export type AssistantActionSet = Pick<
  AppActions,
  | 'cancelAssistantLogin'
  | 'clearAssistantThreads'
  | 'createAssistantThread'
  | 'interruptAssistantThread'
  | 'interruptAssistantTurn'
  | 'loadAssistantThread'
  | 'logoutAssistant'
  | 'openMentionedChannel'
  | 'setAssistantActiveThread'
  | 'startAssistantChatgptLogin'
  | 'startAssistantTurn'
  | 'updateAssistantDefaultModel'
  | 'useAssistantDraft'
>;
export type NetworkManagerActionSet = Pick<
  AppActions,
  'connectNetwork' | 'deleteNetwork' | 'duplicateNetwork' | 'saveFavorite'
>;
export type NetworkEditorActionSet = Pick<AppActions, 'submitNetwork'>;
