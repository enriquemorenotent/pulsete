import type {
  RuntimeConversationStore,
  RuntimeMutedNickStore,
  RuntimeNetworkStore,
  RuntimeStore,
} from './runtime-store.js';

export type RuntimeConversationServiceOptions = {
  conversations: RuntimeConversationStore;
  mutedNicks: Pick<RuntimeMutedNickStore, 'list'>;
  networks: Pick<RuntimeNetworkStore, 'get'>;
  drafts: Pick<RuntimeStore['drafts'], 'get'>;
};

export { isServerChannel as isChannelTarget } from '../shared/irc-server-rules.js';
