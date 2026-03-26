import type { ChannelUserMode } from '../../shared/protocol.js';

export const channelUserModeTone = (mode: ChannelUserMode) => {
  if (mode === 'owner') {
    return 'text-rose-300';
  }
  if (mode === 'admin') {
    return 'text-red-300';
  }
  if (mode === 'op') {
    return 'text-amber-300';
  }
  if (mode === 'halfop') {
    return 'text-yellow-300';
  }
  if (mode === 'voice') {
    return 'text-emerald-300';
  }
  return 'text-inherit';
};
