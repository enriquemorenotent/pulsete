import { defaultAssistantModel } from '../../shared/assistant-defaults.js';
import { canonicalizeAssistantText } from '../../shared/assistant-document.js';
import type { AssistantItem, AssistantSnapshot, AssistantThread, AssistantTurn } from '../../shared/protocol.js';
import type { Action, AppDomainState } from './app-types.js';

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

const pruneAssistantThreads = (threads: Record<string, AssistantThread>, threadIds: string[]) => {
  const allowed = new Set(threadIds);
  return Object.fromEntries(
    Object.entries(threads).filter(([threadId]) => allowed.has(threadId))
  );
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
  const nextThread = !loadedThread ? null : {
    ...loadedThread,
    turnStatus: loadedThread.turnStatus === 'inProgress' ? interruptedStatus : loadedThread.turnStatus,
    updatedAt,
    turns: loadedThread.turns.map((turn) => (
      turn.status === 'inProgress'
        ? { ...turn, status: interruptedStatus, error: null }
        : turn
    )),
  };
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
  return {
    ...domain,
    assistantThreads: {
      ...domain.assistantThreads,
      [threadId]: {
        ...thread,
        turns: thread.turns.map((turn) =>
          turn.id === turnId
            ? {
                ...turn,
                items: upsertItem(turn.items, item, appendText),
              }
            : turn
        ),
      },
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
  return {
    ...domain,
    assistantThreads: {
      ...domain.assistantThreads,
      [threadId]: {
        ...thread,
        turns: thread.turns.map((turn) =>
          turn.id === turnId
            ? {
                ...turn,
                items: turn.items.map((item) =>
                  item.id === itemId && item.type === 'agentMessage'
                    ? {
                        ...item,
                        text: thread.task === 'ask'
                          ? canonicalizeAssistantText(item.text + delta)
                          : item.text + delta,
                      }
                    : item
                ),
              }
            : turn
        ),
      },
    },
  };
};

const upsertTurn = (turns: AssistantTurn[], nextTurn: AssistantTurn) => {
  const index = turns.findIndex((turn) => turn.id === nextTurn.id);
  if (index === -1) {
    return [...turns, nextTurn];
  }
  return turns.map((turn, turnIndex) => turnIndex === index ? nextTurn : turn);
};

const upsertItem = (items: AssistantItem[], nextItem: AssistantItem, appendText: boolean) => {
  const index = items.findIndex((item) => item.id === nextItem.id);
  if (index === -1) {
    return [...items, nextItem];
  }
  return items.map((item, itemIndex) => {
    if (itemIndex !== index) {
      return item;
    }
    if (
      appendText
      && item.type === 'agentMessage'
      && nextItem.type === 'agentMessage'
    ) {
      return { ...nextItem, text: item.text + nextItem.text };
    }
    return nextItem;
  });
};
