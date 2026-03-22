import { createRuntimeServices } from './runtime-core.js';
import type { RuntimeStore } from './runtime-core.js';

export type {
  RuntimeContext,
  RuntimeConversationMutations,
  RuntimeFriendMutations,
  RuntimeGateway,
  RuntimeNetworkCatalog,
  RuntimeNetworkMutations,
  RuntimeStore,
} from './runtime-core.js';

export type Runtime = ReturnType<typeof createRuntimeServices>;

export const createRuntime = (store: RuntimeStore): Runtime => createRuntimeServices(store);
