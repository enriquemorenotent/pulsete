import { useSyncExternalStore } from 'react';
import type { AiAssistantMode } from '../../shared/protocol-ai.js';
import type { AssistantEntry } from './AiAssistantChatTypes.js';

type Listener = () => void;

export type AiAssistantThreadState = {
  activeRequestId: number | null;
  entries: readonly AssistantEntry[];
  error: string;
  input: string;
  pending: boolean;
  pendingLabel: string;
};

type StartRequestInput = {
  label: string;
  pendingLabel: string;
};

type ResolveRequestInput = {
  mode: AiAssistantMode;
  text: string;
};

export type AiAssistantStoreApi = {
  clearThread: (bufferId: string) => void;
  failRequest: (bufferId: string, requestId: number, error: string) => void;
  getThread: (bufferId: string | null) => AiAssistantThreadState;
  pruneThreads: (activeBufferIds: readonly string[]) => void;
  resolveRequest: (
    bufferId: string,
    requestId: number,
    result: ResolveRequestInput,
  ) => void;
  setInput: (bufferId: string, input: string) => void;
  startRequest: (bufferId: string, input: StartRequestInput) => number | null;
  subscribe: (listener: Listener) => () => void;
};

const emptyEntries: readonly AssistantEntry[] = [];

export const emptyAiAssistantThread: AiAssistantThreadState = {
  activeRequestId: null,
  entries: emptyEntries,
  error: '',
  input: '',
  pending: false,
  pendingLabel: 'Thinking',
};

export const createAiAssistantStore = (): AiAssistantStoreApi => {
  let threads: Record<string, AiAssistantThreadState> = {};
  let nextEntryId = 1;
  let nextRequestId = 1;
  const listeners = new Set<Listener>();

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const updateThread = (
    bufferId: string,
    update: (current: AiAssistantThreadState) => AiAssistantThreadState,
  ) => {
    const current = threads[bufferId] ?? emptyAiAssistantThread;
    const next = update(current);
    if (next === current) {
      return;
    }
    threads = { ...threads, [bufferId]: next };
    notify();
  };

  const finishRequest = (
    bufferId: string,
    requestId: number,
    update: (current: AiAssistantThreadState) => AiAssistantThreadState,
  ) => {
    const current = threads[bufferId];
    if (!current || current.activeRequestId !== requestId) {
      return;
    }
    updateThread(bufferId, update);
  };

  return {
    clearThread(bufferId) {
      if (!(bufferId in threads)) {
        return;
      }
      const { [bufferId]: _removed, ...retained } = threads;
      threads = retained;
      notify();
    },
    failRequest(bufferId, requestId, error) {
      finishRequest(bufferId, requestId, (current) => ({
        ...current,
        activeRequestId: null,
        error,
        pending: false,
        pendingLabel: 'Thinking',
      }));
    },
    getThread(bufferId) {
      return bufferId ? threads[bufferId] ?? emptyAiAssistantThread : emptyAiAssistantThread;
    },
    pruneThreads(activeBufferIds) {
      const active = new Set(activeBufferIds);
      const retained = Object.fromEntries(
        Object.entries(threads).filter(([bufferId]) => active.has(bufferId)),
      );
      if (Object.keys(retained).length === Object.keys(threads).length) {
        return;
      }
      threads = retained;
      notify();
    },
    resolveRequest(bufferId, requestId, result) {
      finishRequest(bufferId, requestId, (current) => ({
        ...current,
        activeRequestId: null,
        entries: [
          ...current.entries,
          {
            id: nextEntryId++,
            mode: result.mode,
            role: 'assistant',
            text: result.text,
          },
        ],
        error: '',
        pending: false,
        pendingLabel: 'Thinking',
      }));
    },
    setInput(bufferId, input) {
      if (!input && !(bufferId in threads)) {
        return;
      }
      updateThread(bufferId, (current) => current.input === input
        ? current
        : { ...current, input });
    },
    startRequest(bufferId, input) {
      const current = threads[bufferId] ?? emptyAiAssistantThread;
      if (current.pending) {
        return null;
      }
      const requestId = nextRequestId++;
      updateThread(bufferId, (thread) => ({
        ...thread,
        activeRequestId: requestId,
        entries: [
          ...thread.entries,
          { id: nextEntryId++, role: 'user', text: input.label },
        ],
        error: '',
        pending: true,
        pendingLabel: input.pendingLabel,
      }));
      return requestId;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export const useAiAssistantThread = (
  store: AiAssistantStoreApi,
  bufferId: string | null,
) => useSyncExternalStore(
  store.subscribe,
  () => store.getThread(bufferId),
  () => store.getThread(bufferId),
);

export const hasAiAssistantThreadContent = (thread: AiAssistantThreadState) =>
  thread.entries.length > 0
  || Boolean(thread.error)
  || Boolean(thread.input)
  || thread.pending;
