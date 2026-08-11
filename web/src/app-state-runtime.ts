import type { Action, AppDomainState } from './app-types.js';
import { removeNetworkMessages } from './conversation-message-state.js';
import { emptyNetworkRuntimeCapabilities } from '../../shared/protocol-chat.js';

export const offlineNetworkStates = (state: Pick<AppDomainState, 'networks'>) =>
  Object.fromEntries(
    state.networks.map((network) => [
      network.id,
      {
        phase: 'offline' as const,
        serverName: null,
        nick: network.nick,
        capabilities: emptyNetworkRuntimeCapabilities(),
      },
    ])
  );

export const reduceRuntimeDomain = (
  domain: AppDomainState,
  action: Action,
): AppDomainState | null => {
  switch (action.type) {
    case 'gateway-connecting':
      return {
        ...domain,
        gatewayStatus: 'connecting',
      };
    case 'gateway-connected':
      return {
        ...domain,
        gatewayStatus: 'connected',
      };
    case 'gateway-disconnected':
      return {
        ...domain,
        gatewayStatus: 'disconnected',
        pendingChannels: [],
        networkStates: offlineNetworkStates(domain),
      };
    case 'update-preferences':
      return { ...domain, preferences: action.preferences };
    case 'upsert-avatar-override':
      return {
        ...domain,
        userAvatarOverrides: [
          ...domain.userAvatarOverrides.filter(({ id }) => id !== action.avatarOverride.id),
          action.avatarOverride,
        ],
      };
    case 'remove-avatar-override':
      return {
        ...domain,
        userAvatarOverrides: domain.userAvatarOverrides.filter(
          ({ id }) => id !== action.avatarOverrideId,
        ),
      };
    case 'upsert-draft':
      return {
        ...domain,
        drafts: [...domain.drafts.filter(({ bufferId }) => bufferId !== action.draft.bufferId), action.draft],
      };
    case 'remove-draft':
      return {
        ...domain,
        drafts: domain.drafts.filter(({ bufferId }) => bufferId !== action.bufferId),
      };
    case 'complete-browser-storage-import':
      return { ...domain, browserStorageImportPending: false };
    case 'upsert-network': {
      const networks = domain.networks.filter((network) => network.id !== action.network.id);
      networks.push(action.network);
      const runtime = domain.networkStates[action.network.id] ?? null;
      const networkStates =
        runtime?.phase === 'connected'
          ? domain.networkStates
          : {
              ...domain.networkStates,
              [action.network.id]: {
                phase: runtime?.phase ?? 'offline',
                serverName: runtime?.serverName ?? null,
                nick: action.network.nick,
                capabilities: runtime?.capabilities ?? emptyNetworkRuntimeCapabilities(),
              },
            };
      if (!action.network.workspaceOpen) {
        const removedBufferIds = new Set(
          domain.buffers
            .filter((buffer) => buffer.networkId === action.network.id)
            .map((buffer) => buffer.id),
        );
        const queryPresence = { ...domain.queryPresence };
        for (const bufferId of removedBufferIds) {
          delete queryPresence[bufferId];
        }
        return {
          ...domain,
          networks: networks.sort((left, right) => left.name.localeCompare(right.name)),
          buffers: domain.buffers.filter((buffer) => buffer.networkId !== action.network.id),
          channels: domain.channels.filter((channel) => channel.networkId !== action.network.id),
          pendingChannels: domain.pendingChannels.filter(
            (pendingChannel) => pendingChannel.networkId !== action.network.id,
          ),
          messages: removeNetworkMessages(domain.messages, action.network.id),
          pinnedMessages: removeNetworkMessages(domain.pinnedMessages, action.network.id),
          networkStates,
          queryPresence,
        };
      }
      return {
        ...domain,
        networks: networks.sort((left, right) => left.name.localeCompare(right.name)),
        networkStates,
      };
    }
    case 'network-state':
      return {
        ...domain,
        networkStates: {
          ...domain.networkStates,
          [action.networkId]: {
            phase: action.phase,
            serverName: action.serverName,
            nick: action.nick,
            capabilities: action.capabilities,
          },
        },
        pendingChannels:
          action.phase === 'connected'
            ? domain.pendingChannels
            : domain.pendingChannels.filter((pendingChannel) => pendingChannel.networkId !== action.networkId),
      };
    case 'remove-network': {
      const networkStates = { ...domain.networkStates };
      const removedBufferIds = new Set(
        domain.buffers
          .filter((buffer) => buffer.networkId === action.networkId)
          .map((buffer) => buffer.id),
      );
      delete networkStates[action.networkId];
      return {
        ...domain,
        networks: domain.networks.filter((network) => network.id !== action.networkId),
        buffers: domain.buffers.filter((buffer) => buffer.networkId !== action.networkId),
        channels: domain.channels.filter((channel) => channel.networkId !== action.networkId),
        mutedNicks: domain.mutedNicks.filter((mutedNick) => mutedNick.networkId !== action.networkId),
        nickEmojis: domain.nickEmojis.filter((nickEmoji) => nickEmoji.networkId !== action.networkId),
        pendingChannels: domain.pendingChannels.filter((pendingChannel) => pendingChannel.networkId !== action.networkId),
        queryPresence: Object.fromEntries(
          Object.entries(domain.queryPresence).filter(([bufferId]) => !removedBufferIds.has(bufferId))
        ),
        messages: removeNetworkMessages(domain.messages, action.networkId),
        pinnedMessages: removeNetworkMessages(domain.pinnedMessages, action.networkId),
        networkStates,
        userAvatarOverrides: domain.userAvatarOverrides.filter(
          ({ networkId }) => networkId !== action.networkId,
        ),
        drafts: domain.drafts.filter(({ networkId: draftNetworkId }) => draftNetworkId !== action.networkId),
        preferences: removeNetworkPreferences(domain.preferences, action.networkId),
      };
    }
    default:
      return null;
  }
};

const removeNetworkPreferences = (
  preferences: AppDomainState['preferences'],
  networkId: string,
) => {
  const serverSidebarAccordions = { ...preferences.serverSidebarAccordions };
  delete serverSidebarAccordions[networkId];
  return {
    ...preferences,
    contactNotifications: {
      ...preferences.contactNotifications,
      contacts: preferences.contactNotifications.contacts.filter(
        (contact) => contact.networkId !== networkId,
      ),
      channels: preferences.contactNotifications.channels.filter(
        (channel) => channel.networkId !== networkId,
      ),
    },
    serverSidebarAccordions,
  };
};
