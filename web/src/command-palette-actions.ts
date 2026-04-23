import type {
  BuildCommandPaletteEntrySpecsInput,
  CommandPaletteAction,
  CommandPaletteActionHandlers,
  CommandPaletteEntryRanking,
  CommandPaletteEntrySpec,
  CommandPaletteHotkeyEvent,
} from './command-palette-types.js';

export const buildCommandPaletteActionEntries = (
  input: BuildCommandPaletteEntrySpecsInput,
): CommandPaletteEntrySpec[] => {
  const entries: CommandPaletteEntrySpec[] = [
    createActionEntry('open-preferences', 'Preferences', 'App settings and notifications', ['settings', 'preferences', 'notifications']),
    createActionEntry('open-network-manager', 'Network Manager', 'Saved networks and live connection state', ['networks', 'connections', 'server']),
  ];

  if (input.selectedNetwork.available) {
    entries.push(
      createActionEntry(
        'open-channel-list',
        'List Channels',
        input.selectedNetwork.label ? `Browse channels on ${input.selectedNetwork.label}` : 'Browse channels',
        ['channels', 'list', 'join'],
        true,
      ),
    );
  }

  appendSelectedBufferActions(entries, input);
  return entries;
};

export const shouldOpenCommandPaletteFromKeydown = (
  event: CommandPaletteHotkeyEvent,
  input: { blockingDialogOpen: boolean; paletteOpen: boolean },
) =>
  !event.defaultPrevented
  && !event.isComposing
  && !input.paletteOpen
  && !input.blockingDialogOpen
  && (event.ctrlKey || event.metaKey)
  && !event.altKey
  && !event.shiftKey
  && event.key.toLowerCase() === 'k';

export const runCommandPaletteAction = (
  action: CommandPaletteAction,
  handlers: CommandPaletteActionHandlers,
) => {
  switch (action.kind) {
    case 'select-network':
      return handlers.selectNetwork(action.networkId);
    case 'select-buffer':
      return handlers.selectBuffer(action.bufferId);
    case 'select-pending-channel':
      return handlers.selectPendingChannel(action.networkId, action.channel);
    case 'select-friend':
      return handlers.selectFriend(action.friendId);
    case 'open-preferences':
      return handlers.openPreferences();
    case 'open-network-manager':
      return handlers.openNetworkManager();
    case 'open-channel-list':
      return handlers.openChannelList();
    case 'toggle-current-channel-autojoin':
      return handlers.toggleCurrentChannelAutoJoin();
    case 'download-buffer-history':
      return handlers.downloadBufferHistory(action.bufferId);
    case 'open-history-import':
      return handlers.openHistoryImport(action.bufferId);
    case 'open-self-aliases':
      return handlers.openSelfAliases(action.bufferId);
  }
};

const appendSelectedBufferActions = (
  entries: CommandPaletteEntrySpec[],
  input: BuildCommandPaletteEntrySpecsInput,
) => {
  const { id: bufferId, label } = input.selectedBuffer;
  if (input.actions.canToggleChannelAutoJoin) {
    entries.push(
      createActionEntry(
        'toggle-current-channel-autojoin',
        input.actions.channelAutoJoinActive ? 'Disable Autojoin' : 'Enable Autojoin',
        label ? `For ${label}` : 'For current channel',
        ['autojoin', 'channel'],
        true,
      ),
    );
  }
  if (!bufferId) {
    return;
  }
  pushBufferAction(entries, input.actions.canDownloadHistory, bufferId, 'download-buffer-history', 'Download History', label ? `For ${label}` : 'For current buffer', ['download', 'history', 'export']);
  pushBufferAction(entries, input.actions.canImportHistory, bufferId, 'open-history-import', 'Import Logs', label ? `Into ${label}` : 'Into current buffer', ['import', 'logs', 'history', 'hexchat']);
  pushBufferAction(entries, input.actions.canOpenSelfAliases, bufferId, 'open-self-aliases', 'Self Aliases', label ? `Repair self history in ${label}` : 'Repair self history', ['aliases', 'self', 'repair', 'history']);
};

const pushBufferAction = (
  entries: CommandPaletteEntrySpec[],
  enabled: boolean,
  bufferId: string,
  kind: Extract<CommandPaletteAction['kind'], 'download-buffer-history' | 'open-history-import' | 'open-self-aliases'>,
  label: string,
  subtitle: string,
  keywords: string[],
) => {
  if (!enabled) {
    return;
  }
  entries.push(createActionEntry(kind, label, subtitle, keywords, true, { bufferId }));
};

const createActionEntry = (
  kind: CommandPaletteAction['kind'],
  label: string,
  subtitle: string,
  keywords: string[],
  currentNetwork = false,
  actionExtras: Record<string, string> = {},
): CommandPaletteEntrySpec => ({
  id: `action:${kind}`,
  section: 'actions',
  label,
  subtitle,
  keywords,
  badge: 'action',
  ranking: createRanking(currentNetwork),
  action: { kind, ...actionExtras } as CommandPaletteAction,
});

const createRanking = (currentNetwork: boolean): CommandPaletteEntryRanking => ({
  currentNetwork,
  priorityUnread: 0,
  selected: false,
  unread: 0,
});
