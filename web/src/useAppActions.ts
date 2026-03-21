import { createConversationQueries } from './conversation-selectors.js';
import { createChatActions } from './app-actions-chat.js';
import { createConversationActions } from './app-actions-conversation.js';
import { createFriendActions } from './app-actions-friends.js';
import { createGatewayActions } from './app-actions-gateway.js';
import { createNetworkActions } from './app-actions-networks.js';
import type { AppActionContext, AppActionParams } from './app-actions-types.js';

export function useAppActions(params: AppActionParams) {
  const conversation = createConversationQueries(params.state);
  const gateway = createGatewayActions(params);
  const helpers = createConversationActions({ params, conversation, ...gateway });
  const context: AppActionContext = {
    ...params,
    ...gateway,
    ...helpers,
    conversation,
  };

  return {
    ...createNetworkActions(context),
    ...createFriendActions(context),
    ...createChatActions(context),
  };
}
