import { defaultAssistantModel } from '../../shared/assistant-defaults.js';
import type { AssistantItem, AssistantSnapshot, AssistantThread, AssistantTurn } from '../../shared/protocol.js';
import type { Action, AppDomainState } from './app-types.js';
import {
  appendAssistantItemDelta,
  interruptLoadedAssistantThread,
  pruneAssistantThreads,
  updateAssistantTurnsForThread,
  upsertItem,
  upsertTurn,
} from './assistant-state-helpers.js';

export const emptyAssistantSnapshot: AssistantSnapshot = {
  serviceStatus: 'starting',
  serviceError: null,
  auth: {
    requiresOpenaiAuth: true,
    account: null,
    pendingLoginId: null,
    pendingAuthUrl: null,
    lastError: null,
  },
  rateLimits: null,
  rateLimitBuckets: [],
  models: [],
  defaultModel: defaultAssistantModel,
  activeThreadId: null,
  threads: [],
};

export const reduceAssistantDomain = (
  domain: AppDomainState,
  action: Action
): AppDomainState | null => {
  switch (action.type) {
    case 'assistant-snapshot':
      return {
        ...domain,
        assistant: action.assistant,
        assistantThreads: pruneAssistantThreads(domain.assistantThreads, action.assistant.threads.map((thread) => thread.id)),
      };
    case 'assistant-thread-loaded':
      return {
        ...domain,
        assistantThreads: {
          ...domain.assistantThreads,
          [action.thread.id]: action.thread,
        },
      };
    case 'assistant-thread-removed':
      return {
        ...domain,
        assistant: {
          ...domain.assistant,
          activeThreadId: domain.assistant.activeThreadId === action.threadId ? null : domain.assistant.activeThreadId,
          threads: domain.assistant.threads.filter((thread) => thread.id !== action.threadId),
        },
        assistantThreads: Object.fromEntries(
          Object.entries(domain.assistantThreads).filter(([threadId]) => threadId !== action.threadId)
        ),
      };
    case 'assistant-thread-stop-requested':
      return interruptAssistantThread(domain, action.threadId);
    case 'assistant-turn-started':
    case 'assistant-turn-completed':
      return updateAssistantTurn(domain, action.threadId, action.turn);
    case 'assistant-item-started':
    case 'assistant-item-completed':
      return updateAssistantItem(domain, action.threadId, action.turnId, action.item, false);
    case 'assistant-item-delta':
      return updateAssistantItemDelta(domain, action.threadId, action.turnId, action.itemId, action.delta);
    default:
      return null;
  }
};

const interruptAssistantThread = (domain: AppDomainState, threadId: string) => {
  const updatedAt = Date.now();
  const interruptedStatus = 'interrupted' as const;
  let summaryChanged = false;
  const threads = domain.assistant.threads.map((thread) => {
    if (thread.id !== threadId || thread.turnStatus !== 'inProgress') {
      return thread;
    }
    summaryChanged = true;
    return {
      ...thread,
      turnStatus: interruptedStatus,
      updatedAt,
    };
  });
  const loadedThread = domain.assistantThreads[threadId];
  const nextThread = interruptLoadedAssistantThread(
    loadedThread,
    interruptedStatus,
    updatedAt,
  );
  const threadChanged = loadedThread !== undefined && nextThread !== null && (
    nextThread.turnStatus !== loadedThread.turnStatus
    || nextThread.turns.some((turn, index) => turn !== loadedThread.turns[index])
  );
  if (!summaryChanged && !threadChanged) {
    return null;
  }
  return {
    ...domain,
    assistant: summaryChanged
      ? {
          ...domain.assistant,
          threads,
        }
      : domain.assistant,
    assistantThreads: threadChanged
      ? {
          ...domain.assistantThreads,
          [threadId]: nextThread,
        }
      : domain.assistantThreads,
  };
};

const updateAssistantTurn = (domain: AppDomainState, threadId: string, turn: AssistantTurn) => {
  const updatedAt = Date.now();
  let summaryChanged = false;
  const threads = domain.assistant.threads.map((thread) => {
    if (thread.id !== threadId) {
      return thread;
    }
    summaryChanged = true;
    return {
      ...thread,
      turnStatus: turn.status,
      updatedAt,
    };
  }).sort((left, right) => right.updatedAt - left.updatedAt);
  const thread = domain.assistantThreads[threadId];
  const nextThread = !thread ? null : {
    ...thread,
    turnStatus: turn.status,
    updatedAt,
    turns: upsertTurn(thread.turns, turn),
  };
  if (!summaryChanged && !nextThread) {
    return null;
  }
  return {
    ...domain,
    assistant: summaryChanged
      ? {
          ...domain.assistant,
          threads,
        }
      : domain.assistant,
    assistantThreads: nextThread
      ? {
          ...domain.assistantThreads,
          [threadId]: nextThread,
        }
      : domain.assistantThreads,
  };
};

const updateAssistantItem = (
  domain: AppDomainState,
  threadId: string,
  turnId: string,
  item: AssistantItem,
  appendText: boolean
) => {
  const thread = domain.assistantThreads[threadId];
  if (!thread) {
    return null;
  }
  const nextThread = updateAssistantTurnsForThread(
    domain,
    threadId,
    (turn) =>
      turn.id === turnId
        ? {
            ...turn,
            items: upsertItem(turn.items, item, appendText),
          }
        : turn,
  );
  return {
    ...domain,
    assistantThreads: {
      ...domain.assistantThreads,
      [threadId]: nextThread ?? thread,
    },
  };
};

const updateAssistantItemDelta = (
  domain: AppDomainState,
  threadId: string,
  turnId: string,
  itemId: string,
  delta: string
) => {
  const thread = domain.assistantThreads[threadId];
  if (!thread) {
    return null;
  }
  const nextThread = updateAssistantTurnsForThread(
    domain,
    threadId,
    (turn, currentThread) =>
      turn.id === turnId
        ? {
            ...turn,
            items: turn.items.map((item) =>
              item.id === itemId
                ? appendAssistantItemDelta(item, delta, currentThread.task)
                : item,
            ),
          }
        : turn,
  );
  return {
    ...domain,
    assistantThreads: {
      ...domain.assistantThreads,
      [threadId]: nextThread ?? thread,
    },
  };
};
