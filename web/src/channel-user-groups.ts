import type { ChannelUserMode, ChannelUserState } from '../../shared/protocol-chat.js';
import { channelUserGroupLabels, sortChannelUsers } from '../../shared/channel-users.js';

export type ChannelUserGroup = {
  mode: ChannelUserMode;
  label: string;
  users: ChannelUserState[];
};

const orderedModes: ChannelUserMode[] = ['owner', 'admin', 'op', 'halfop', 'voice', 'normal'];

export const groupChannelUsers = (users: ChannelUserState[]): ChannelUserGroup[] => {
  const grouped = new Map<ChannelUserMode, ChannelUserState[]>();
  for (const mode of orderedModes) {
    grouped.set(mode, []);
  }
  for (const user of sortChannelUsers(users)) {
    grouped.get(user.mode)?.push(user);
  }
  return orderedModes
    .map((mode) => ({
      mode,
      label: channelUserGroupLabels[mode],
      users: grouped.get(mode) ?? [],
    }))
    .filter((group) => group.users.length > 0);
};
