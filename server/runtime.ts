import type { RuntimeConnectionManager } from './runtime-connection-manager.js';
import { createRuntimeServices } from './runtime-core.js';
import type {
  RuntimeContext,
  RuntimeConversationMutations,
  RuntimeFriendMutations,
  RuntimeGateway,
  RuntimeNetworkMutations,
  RuntimeStore,
} from './runtime-core.js';
import type { RuntimeIrcService } from './runtime-irc-service.js';
import type { RuntimeNetworkSessionService } from './runtime-network-session-service.js';

export type {
  RuntimeContext,
  RuntimeConversationMutations,
  RuntimeFriendMutations,
  RuntimeGateway,
  RuntimeNetworkCatalog,
  RuntimeNetworkMutations,
  RuntimeStore,
} from './runtime-core.js';

export class Runtime {
  readonly connections: RuntimeConnectionManager['connections'];
  readonly gateway: RuntimeGateway;
  readonly sessions: RuntimeNetworkSessionService;
  readonly conversations: RuntimeConversationMutations;
  readonly friends: RuntimeFriendMutations;
  readonly irc: Pick<RuntimeIrcService, 'join' | 'part' | 'sendMessage' | 'sendRaw'>;
  readonly networks: RuntimeNetworkMutations;
  readonly context: RuntimeContext;

  constructor(store: RuntimeStore) {
    const services = createRuntimeServices(store);
    this.connections = services.connections;
    this.gateway = services.gateway;
    this.sessions = services.sessions;
    this.conversations = services.conversations;
    this.friends = services.friends;
    this.irc = services.irc;
    this.networks = services.networks;
    this.context = services.context;
  }
}
