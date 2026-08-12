import { createChatActions } from './app-actions-chat.js';
import { downloadFullBackup, importFullBackup } from './backup-client.js';
import { createConversationActions } from './app-actions-conversation.js';
import { createFriendActions } from './app-actions-friends.js';
import { createGatewayActions } from './app-actions-gateway.js';
import { createMutedNickActions } from './app-actions-muted-nicks.js';
import { createNetworkActions } from './app-actions-networks.js';
import { createNickEmojiActions } from './app-actions-nick-emojis.js';
import { createPreferenceActions } from './app-actions-preferences.js';
import { createMessagePinActions } from './app-actions-message-pins.js';
import {
  type AppActionContext,
  type ApplyServerMessages,
  type AppDispatch,
  type MutableRef,
} from './app-actions-types.js';
import type { SocketHandle } from './client.js';

type CreateAppActionsParams = {
  applyServerMessages: ApplyServerMessages;
  getConversation?: AppActionContext['getConversation'];
  getDraft: AppActionContext['getDraft'];
  getState: AppActionContext['getState'];
  getWorkspace?: AppActionContext['getWorkspace'];
  dispatch: AppDispatch;
  socketRef: MutableRef<SocketHandle | null>;
  recordComposerEntry: AppActionContext['recordComposerEntry'];
  setDraft: AppActionContext['setDraft'];
  updateBanner: (kind: 'notice' | 'error', message: string) => void;
};

export const createAppActions = (params: CreateAppActionsParams) => {
  const actionContext: AppActionContext = {
    getConversation: params.getConversation,
    getDraft: params.getDraft,
    getState: params.getState,
    getWorkspace: params.getWorkspace,
    applyServerMessages: params.applyServerMessages,
    dispatch: params.dispatch,
    socketRef: params.socketRef,
    setDraft: params.setDraft,
    recordComposerEntry: params.recordComposerEntry,
    updateBanner: params.updateBanner,
  };
  const gateway = createGatewayActions({
    getState: params.getState,
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
    exportBackup: downloadFullBackup,
    importBackup: importFullBackup,
    ...createNetworkActions({
      ...actionContext,
    }),
    saveBufferNotes: conversation.saveBufferNotes,
    listLogSources: conversation.listLogSources,
    loadBufferHistory: conversation.loadBufferHistory,
    searchLogs: conversation.searchLogs,
    ...createFriendActions({
      ...actionContext,
      ...conversation,
    }),
    ...createNickEmojiActions({
      ...actionContext,
    }),
    ...createPreferenceActions(actionContext),
    ...mutedNickActions,
    ...createMessagePinActions(actionContext),
    ...createChatActions({
      ...actionContext,
      ...gateway,
      ...conversation,
    }),
  };
};

export type AppActions = ReturnType<typeof createAppActions>;
export type ChatActionSet = Pick<
  AppActions,
  | 'clearBufferHistory'
  | 'closeBuffer'
  | 'closeChannel'
  | 'closeChannelList'
  | 'downloadBufferHistory'
  | 'joinChannelFromList'
  | 'openChannelList'
  | 'openMentionedChannel'
  | 'reconnectNetwork'
  | 'requestWhois'
  | 'returnBufferToLatest'
  | 'searchBufferHistory'
  | 'selectPrivateBuffer'
  | 'setMessagePinned'
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
  'saveNickEmoji' | 'selectPrivateBuffer'
>;
export type NetworkManagerActionSet = Pick<
  AppActions,
  'connectNetwork' | 'deleteNetwork' | 'duplicateNetwork' | 'saveFavorite'
>;
export type NetworkEditorActionSet = Pick<AppActions, 'submitNetwork'>;
