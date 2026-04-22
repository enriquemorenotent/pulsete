import type { AssistantThreadSummary } from '../../shared/protocol.js';

export const getAskThreads = (
  threads: AssistantThreadSummary[],
) => [...threads]
  .filter((thread) => thread.task === 'ask')
  .sort((left, right) => right.updatedAt - left.updatedAt);

export const getAskThreadsForBuffer = (
  threads: AssistantThreadSummary[],
  bufferId: string | null,
) => {
  if (!bufferId) {
    return [];
  }
  return getAskThreads(threads)
    .filter((thread) => thread.scope === 'buffer' && thread.bufferId === bufferId);
};

export const getAskThreadForBuffer = (
  threads: AssistantThreadSummary[],
  bufferId: string | null,
) => getAskThreadsForBuffer(threads, bufferId)[0] ?? null;
