import { createRuntimeServices } from './runtime-core.js';
import type { RuntimeStore } from './runtime-core.js';

export type {
  RuntimeConversationMutations,
  RuntimeFriendMutations,
  RuntimeGateway,
  RuntimeHttpApi,
  RuntimeNetworkCatalog,
  RuntimeNetworkMutations,
  RuntimeWebSocketApi,
  RuntimeStore,
} from './runtime-core.js';

export type Runtime = ReturnType<typeof createRuntimeServices>;

export const createRuntime = (store: RuntimeStore): Runtime => createRuntimeServices(store);
