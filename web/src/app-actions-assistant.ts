import { createAssistantAuthActions } from './app-actions-assistant-auth.js';
import { createAssistantActionContext, type AssistantActionParams } from './app-actions-assistant-shared.js';
import { createAssistantThreadActions } from './app-actions-assistant-threads.js';
import { createAssistantTurnActions } from './app-actions-assistant-turns.js';

export const createAssistantActions = (params: AssistantActionParams) => {
  const context = createAssistantActionContext(params);
  return {
    ...createAssistantAuthActions(context),
    ...createAssistantThreadActions(context),
    ...createAssistantTurnActions(context),
  };
};

export type AssistantActionSet = ReturnType<typeof createAssistantActions>;
