import { createRuntimeHttpApi } from './runtime-http-api.js';
import type {
  RuntimeConversationMutations,
  RuntimeFriendMutations,
  RuntimeMutedNickMutations,
  RuntimeNickEmojiMutations,
  RuntimeNetworkMutations,
  RuntimePreferenceMutations,
  RuntimeDraftMutations,
  RuntimeAvatarOverrideMutations,
  RuntimeStore,
} from './runtime-service-types.js';
import type { RuntimeAiAssistantService } from './runtime-ai-assistant-service.js';
import type { RuntimeIrcService } from './runtime-irc-service.js';
import type { RuntimeNetworkSessionService } from './runtime-network-session-service.js';

type RuntimeHttpServicesParams = {
  assistant: RuntimeAiAssistantService;
  catalog: RuntimeStore['networks'];
  conversations: RuntimeConversationMutations;
  friends: RuntimeFriendMutations;
  irc: RuntimeIrcService;
  mutedNicks: RuntimeMutedNickMutations;
  networks: RuntimeNetworkMutations;
  nickEmojis: RuntimeNickEmojiMutations;
  sessions: RuntimeNetworkSessionService;
  preferences: RuntimePreferenceMutations;
  drafts: RuntimeDraftMutations;
  avatarOverrides: RuntimeAvatarOverrideMutations;
};

export const createRuntimeHttpServices = ({
  assistant,
  catalog,
  conversations,
  friends,
  irc,
  mutedNicks,
  networks,
  nickEmojis,
  sessions,
  preferences,
  drafts,
  avatarOverrides,
}: RuntimeHttpServicesParams) =>
  createRuntimeHttpApi({
    assistant: {
      ask: (bufferId, request) => assistant.ask(bufferId, request),
      startLogin: () => assistant.startLogin(),
      status: () => assistant.status(),
    },
    catalog,
    conversations,
    friends,
    mutedNicks,
    nickEmojis,
    irc,
    networks,
    sessions: {
      disconnect: (networkId) => sessions.disconnect(networkId),
    },
    preferences,
    drafts,
    avatarOverrides,
  });
