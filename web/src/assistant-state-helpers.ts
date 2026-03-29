import { canonicalizeAssistantText } from '../../shared/assistant-document.js';
import type { AssistantItem, AssistantThread, AssistantTurn } from '../../shared/protocol.js';
import type { AppDomainState } from './app-types.js';

export const pruneAssistantThreads = (
  threads: Record<string, AssistantThread>,
  threadIds: string[],
) => {
  const allowed = new Set(threadIds);
  return Object.fromEntries(
    Object.entries(threads).filter(([threadId]) => allowed.has(threadId)),
  );
};

export const interruptLoadedAssistantThread = (
  loadedThread: AssistantThread | undefined,
  interruptedStatus: 'interrupted',
  updatedAt: number,
) => {
  if (!loadedThread) {
    return null;
  }
  return {
    ...loadedThread,
    turnStatus:
      loadedThread.turnStatus === 'inProgress'
        ? interruptedStatus
        : loadedThread.turnStatus,
    updatedAt,
    turns: loadedThread.turns.map((turn) =>
      turn.status === 'inProgress'
        ? { ...turn, status: interruptedStatus, error: null }
        : turn,
    ),
  };
};

export const updateAssistantTurnsForThread = (
  domain: AppDomainState,
  threadId: string,
  updater: (turn: AssistantTurn, thread: AssistantThread) => AssistantTurn,
) => {
  const thread = domain.assistantThreads[threadId];
  if (!thread) {
    return null;
  }
  return {
    ...thread,
    turns: thread.turns.map((turn) => updater(turn, thread)),
  };
};

export const upsertTurn = (turns: AssistantTurn[], nextTurn: AssistantTurn) => {
  const index = turns.findIndex((turn) => turn.id === nextTurn.id);
  if (index === -1) {
    return [...turns, nextTurn];
  }
  return turns.map((turn, turnIndex) =>
    turnIndex === index ? nextTurn : turn,
  );
};

export const upsertItem = (
  items: AssistantItem[],
  nextItem: AssistantItem,
  appendText: boolean,
) => {
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

export const appendAssistantItemDelta = (
  item: AssistantItem,
  delta: string,
  task: AssistantThread['task'],
) =>
  item.type === 'agentMessage'
    ? {
        ...item,
        text:
          task === 'ask'
            ? canonicalizeAssistantText(item.text + delta)
            : item.text + delta,
      }
    : item;
