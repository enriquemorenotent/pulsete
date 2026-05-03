import type { ChannelUserMode, ChannelUserPrivilegeMode } from './protocol-chat.js';

export const modeByPrefix = {
  '~': 'owner',
  '&': 'admin',
  '@': 'op',
  '%': 'halfop',
  '+': 'voice',
} as const satisfies Record<string, ChannelUserPrivilegeMode>;

export const orderedPrivilegeModes: ChannelUserPrivilegeMode[] = ['owner', 'admin', 'op', 'halfop', 'voice'];
export const orderedModes: ChannelUserMode[] = [...orderedPrivilegeModes, 'normal'];

export const channelUserGroupLabels: Record<ChannelUserMode, string> = {
  owner: 'Owners',
  admin: 'Admins',
  op: 'Operators',
  halfop: 'Half-Ops',
  voice: 'Voiced',
  normal: 'Users',
};

export const getChannelUserModeRank = (mode: ChannelUserMode) =>
  orderedModes.indexOf(mode);

export const normalizeChannelUserModes = (
  modes: readonly ChannelUserMode[] | null | undefined
): ChannelUserPrivilegeMode[] => {
  const uniqueModes = new Set<ChannelUserPrivilegeMode>();
  for (const mode of modes ?? []) {
    if (isChannelUserPrivilegeMode(mode)) {
      uniqueModes.add(mode);
    }
  }
  return Array.from(uniqueModes).sort((left, right) => getChannelUserModeRank(left) - getChannelUserModeRank(right));
};

export const getPrimaryChannelUserMode = (
  modes: readonly ChannelUserMode[] | null | undefined
): ChannelUserMode => normalizeChannelUserModes(modes)[0] ?? 'normal';

const privilegeModes = new Set<ChannelUserMode>(orderedPrivilegeModes);

const isChannelUserPrivilegeMode = (mode: ChannelUserMode): mode is ChannelUserPrivilegeMode =>
  privilegeModes.has(mode) && mode !== 'normal';
