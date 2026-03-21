import type { AppDomainState, AppTransientState, State } from './app-types.js';
import type { ConversationIndex } from './conversation-selectors.js';
import { createChatActions } from './app-actions-chat.js';
import { createConversationActions } from './app-actions-conversation.js';
import { createFriendActions } from './app-actions-friends.js';
import { createGatewayActions } from './app-actions-gateway.js';
import { createNetworkActions } from './app-actions-networks.js';
import type { AppDispatch, DraftActions, MutableRef, WorkspaceActions } from './app-actions-types.js';
import type { SocketHandle } from './client.js';

type UseAppActionsParams = DraftActions & WorkspaceActions & {
  conversation: ConversationIndex;
  dispatch: AppDispatch;
  state?: State;
  buffers?: AppDomainState['buffers'];
  channelList?: AppTransientState['channelList'];
  gatewayStatus?: AppDomainState['gatewayStatus'];
  networks?: AppDomainState['networks'];
  networkStates?: AppDomainState['networkStates'];
  socketRef: MutableRef<SocketHandle | null>;
  updateBanner: (kind: 'notice' | 'error', message: string) => void;
};

export function useAppActions(params: UseAppActionsParams) {
  const buffers = params.buffers ?? params.state?.domain.buffers ?? [];
  const channelList = params.channelList ?? params.state?.transient.channelList;
  const gatewayStatus = params.gatewayStatus ?? params.state?.domain.gatewayStatus ?? 'disconnected';
  const networks = params.networks ?? params.state?.domain.networks ?? [];
  const networkStates = params.networkStates ?? params.state?.domain.networkStates ?? {};
  const resolvedChannelList = channelList ?? {
    open: false,
    networkId: null,
    requestId: null,
    status: 'idle',
    entries: [],
    error: null,
  } satisfies AppTransientState['channelList'];
  const gateway = createGatewayActions({
    gatewayStatus,
    socketRef: params.socketRef,
    updateBanner: params.updateBanner,
  });
  const conversation = createConversationActions({
    channelList: resolvedChannelList,
    conversation: params.conversation,
    dispatch: params.dispatch,
    networkStates,
    updateBanner: params.updateBanner,
    ...gateway,
  });
  return {
    ...createNetworkActions({
      conversation: params.conversation,
      dispatch: params.dispatch,
      updateBanner: params.updateBanner,
    }),
    ...createFriendActions({
      buffers,
      dispatch: params.dispatch,
      networkStates,
      updateBanner: params.updateBanner,
      workspace: params.workspace,
      ...conversation,
    }),
    ...createChatActions({
      channelList: resolvedChannelList,
      conversation: params.conversation,
      dispatch: params.dispatch,
      networks,
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
