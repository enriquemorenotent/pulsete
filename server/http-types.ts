import type { IncomingMessage, ServerResponse } from 'node:http';
import type { URL } from 'node:url';
import type { RuntimeIrcService } from './runtime-irc-service.js';
import type { RuntimeNetworkSessionService } from './runtime-network-session-service.js';
import type { RuntimeConversationMutations, RuntimeFriendMutations, RuntimeGateway, RuntimeNetworkMutations } from './runtime.js';
import type { Storage } from './storage.js';

export type HttpContext = {
  storage: Storage;
  gateway: Pick<RuntimeGateway, 'attachSocket' | 'detachSocket' | 'snapshot'>;
  sessions: Pick<RuntimeNetworkSessionService, 'connect' | 'disconnect' | 'requestChannelList' | 'cancelChannelList'>;
  conversations: RuntimeConversationMutations;
  friends: RuntimeFriendMutations;
  irc: Pick<RuntimeIrcService, 'join' | 'part' | 'sendMessage' | 'sendRaw'>;
  networks: RuntimeNetworkMutations;
};

export type RouteArgs = {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  pathname: string;
  context: HttpContext;
};
