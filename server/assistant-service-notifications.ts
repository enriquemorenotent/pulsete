import type { AssistantServiceAppState } from './assistant-service-app-state.js';
import type { AssistantServiceRuntime } from './assistant-service-runtime.js';
import type {
  RawRateLimits,
  RawThreadItem,
  RawTurn,
} from './assistant-service-shared.js';

export const handleAssistantServiceNotification = async (input: {
  state: AssistantServiceAppState;
  runtime: AssistantServiceRuntime;
  method: string;
  params: unknown;
}) => {
  switch (input.method) {
    case 'account/updated':
      await input.state.handleAccountUpdated();
      return;
    case 'account/rateLimits/updated':
      input.state.handleRateLimitsUpdated(
        (input.params as { rateLimits: RawRateLimits }).rateLimits,
      );
      return;
    case 'account/login/completed':
      await input.state.handleLoginCompleted(
        input.params as {
          loginId?: string;
          success: boolean;
          error?: string | null;
        },
      );
      return;
    case 'turn/started':
      input.runtime.handleTurnStarted(
        input.params as { threadId: string; turn: RawTurn },
      );
      return;
    case 'turn/completed':
      await input.runtime.handleTurnCompleted(
        input.params as { threadId: string; turn: RawTurn },
      );
      return;
    case 'item/started':
      input.runtime.handleItemStarted(
        input.params as { threadId: string; turnId: string; item: RawThreadItem },
      );
      return;
    case 'item/agentMessage/delta':
      input.runtime.handleItemDelta(
        input.params as {
          threadId: string;
          turnId: string;
          itemId: string;
          delta: string;
        },
      );
      return;
    case 'item/completed':
      input.runtime.handleItemCompleted(
        input.params as { threadId: string; turnId: string; item: RawThreadItem },
      );
      return;
    default:
      return;
  }
};
