import type { ConversationIndex } from './conversation-selectors.js';
import { createChatActions } from './app-actions-chat.js';
import { createConversationActions } from './app-actions-conversation.js';
import { createFriendActions } from './app-actions-friends.js';
import { createGatewayActions } from './app-actions-gateway.js';
import { createNetworkActions } from './app-actions-networks.js';
import type { AppActionState, AppDispatch, DraftActions, MutableRef, WorkspaceActions } from './app-actions-types.js';
import type { SocketHandle } from './client.js';

type UseAppActionsParams = AppActionState & DraftActions & WorkspaceActions & {
  conversation: ConversationIndex;
  dispatch: AppDispatch;
  socketRef: MutableRef<SocketHandle | null>;
  updateBanner: (kind: 'notice' | 'error', message: string) => void;
};

export function useAppActions(params: UseAppActionsParams) {
  const gateway = createGatewayActions({
    gatewayStatus: params.gatewayStatus,
    socketRef: params.socketRef,
    updateBanner: params.updateBanner,
  });
  const conversation = createConversationActions({
    channelList: params.channelList,
    conversation: params.conversation,
    dispatch: params.dispatch,
    gatewayStatus: params.gatewayStatus,
    networkStates: params.networkStates,
    updateBanner: params.updateBanner,
    ...gateway,
  });
  return {
    ...createNetworkActions({
      conversation: params.conversation,
      dispatch: params.dispatch,
      gatewayStatus: params.gatewayStatus,
      updateBanner: params.updateBanner,
    }),
    ...createFriendActions({
      buffers: params.buffers,
      dispatch: params.dispatch,
      gatewayStatus: params.gatewayStatus,
      networkStates: params.networkStates,
      updateBanner: params.updateBanner,
      workspace: params.workspace,
      ...conversation,
    }),
    ...createChatActions({
      channelList: params.channelList,
      conversation: params.conversation,
      dispatch: params.dispatch,
      gatewayStatus: params.gatewayStatus,
      networks: params.networks,
      updateBanner: params.updateBanner,
      workspace: params.workspace,
      draft: params.draft,
      setDraft: params.setDraft,
      recordComposerEntry: params.recordComposerEntry,
      ...gateway,
      ...conversation,
    }),
  };
}
