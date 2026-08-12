import type {
  RuntimeConversationStore,
  RuntimeMutedNickStore,
  RuntimeNetworkStore,
} from './runtime-store.js';

export type RuntimeConversationServiceOptions = {
  conversations: RuntimeConversationStore;
  mutedNicks: Pick<RuntimeMutedNickStore, 'list'>;
  networks: Pick<RuntimeNetworkStore, 'get'>;
};

export const isChannelTarget = (value: string) => /^[#&+!]/.test(value);
