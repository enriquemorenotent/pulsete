import type {
  RuntimeConversationStore,
  RuntimeMutedNickStore,
  RuntimeNetworkStore,
} from './runtime-store-ports.js';

export type RuntimeConversationServiceOptions = {
  conversations: RuntimeConversationStore;
  mutedNicks: Pick<RuntimeMutedNickStore, 'list'>;
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
