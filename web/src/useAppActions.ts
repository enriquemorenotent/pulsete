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
import type { State } from './app-types.js';
import type { AppSessionSnapshot } from './app-session.js';
import type { SocketHandle } from './client.js';
import { createServerMessageBridge } from './server-message-bridge.js';

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

type CreateStaticAppActionsParams = {
  applyServerMessages?: ApplyServerMessages;
  draft?: string;
  getDraft?: AppActionContext['getDraft'];
  session?: AppSessionSnapshot;
  state?: State;
  dispatch: AppDispatch;
  socketRef: MutableRef<SocketHandle | null>;
  recordComposerEntry: AppActionContext['recordComposerEntry'];
  setDraft: AppActionContext['setDraft'];
  updateBanner: (kind: 'notice' | 'error', message: string) => void;
};

const createAppActionsFromSession = (params: CreateAppActionsParams) => {
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

const resolveStaticAccessors = (
  params: CreateStaticAppActionsParams,
): Pick<CreateAppActionsParams, 'getDraft' | 'getState'> => {
  if (params.getDraft && params.state) {
    return {
      getDraft: params.getDraft,
      getState: () => params.state as State,
    };
  }
  if (!params.session) {
    throw new Error('createAppActions requires either state/getDraft or session');
  }
  return {
    getDraft: (contextKey) => {
      const selectedBufferId = params.session?.workspace.selectedBuffer?.id ?? null;
      return contextKey === null || contextKey === selectedBufferId
        ? params.session?.draft ?? ''
        : '';
    },
    getState: () => params.session?.state as State,
  };
};

export function createAppActions(params: CreateStaticAppActionsParams) {
  const applyServerMessages =
    params.applyServerMessages ??
    createServerMessageBridge(params.dispatch).applyMutationMessages;
  const accessors = resolveStaticAccessors(params);
  return createAppActionsFromSession({
    applyServerMessages,
    getConversation: params.session ? () => params.session!.conversation : undefined,
    getDraft: accessors.getDraft,
    getState: accessors.getState,
    getWorkspace: params.session ? () => params.session!.workspace : undefined,
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
  | 'closeChannel'
  | 'closeChannelList'
  | 'downloadBufferHistory'
  | 'joinChannelFromList'
  | 'openChannelList'
  | 'openMentionedChannel'
  | 'reconnectNetwork'
  | 'removeFriend'
  | 'removeMutedNick'
  | 'requestWhois'
  | 'searchBufferHistory'
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
export type NetworkManagerActionSet = Pick<
  AppActions,
  'connectNetwork' | 'deleteNetwork' | 'duplicateNetwork' | 'saveFavorite'
>;
export type NetworkEditorActionSet = Pick<AppActions, 'submitNetwork'>;
