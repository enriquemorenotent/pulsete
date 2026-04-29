import { createRuntimeServices } from './runtime-core.js';
import type { RuntimeServices, RuntimeStore } from './runtime-service-types.js';

export type {
  RuntimeConversationMutations,
  RuntimeFriendMutations,
  RuntimeGateway,
  RuntimeHttpApi,
  RuntimeMutedNickMutations,
  RuntimeNickEmojiMutations,
  RuntimeNetworkCatalog,
  RuntimeNetworkMutations,
  RuntimeServices,
  RuntimeWebSocketApi,
  RuntimeStore,
} from './runtime-service-types.js';

export type Runtime = RuntimeServices;

export const createRuntime = (store: RuntimeStore): Runtime => createRuntimeServices(store);
