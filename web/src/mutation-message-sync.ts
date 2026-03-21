import type { ServerMessage } from '../../shared/protocol.js';
import type { AppDispatch } from './app-actions-types.js';
import type { GatewayStatus } from './app-types.js';
import { dispatchInboundServerMessages } from './server-message-actions.js';

export const syncMutationMessages = (
  gatewayStatus: GatewayStatus,
  messages: readonly ServerMessage[],
  dispatch: AppDispatch,
) => {
  if (gatewayStatus !== 'connected') {
    dispatchInboundServerMessages(messages, dispatch);
  }
};
