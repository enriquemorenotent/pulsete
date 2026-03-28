import type { RuntimeConversationStore, RuntimeNetworkStore } from './runtime-store-ports.js';

export type RuntimeConversationServiceOptions = {
  conversations: RuntimeConversationStore;
  networks: Pick<RuntimeNetworkStore, 'get'>;
};

export type ImportBatchStore = RuntimeConversationStore & {
  createHistoryImportBatch?: (input: {
    networkId: string;
    bufferId: string;
    target: string;
    selfNickSnapshot: string[];
  }) => { id: string } | null;
};

export const isChannelTarget = (value: string) => /^[#&+!]/.test(value);

export const haveSameNickAliases = (left: string[], right: string[]) =>
  left.length === right.length
  && left.every((entry, index) => entry === right[index]);
