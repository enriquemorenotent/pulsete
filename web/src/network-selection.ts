import { isSameIrcIdentifier } from '../../shared/irc-identifiers.js';
import type { AppDomainState, State } from './app-types.js';
import type { SelectedBuffer } from './workspace-types.js';

export const rememberNetworkSelection = (
  previous: State,
  domain: AppDomainState,
  selection: SelectedBuffer | null,
) => {
  let remembered = previous.transient.lastSelectionByNetworkId;
  if (domain.buffers !== previous.domain.buffers
    || domain.pendingChannels !== previous.domain.pendingChannels
    || domain.networks !== previous.domain.networks) {
    const openNetworks = new Set(domain.networks.filter((network) => network.workspaceOpen).map(({ id }) => id));
    for (const [networkId, saved] of Object.entries(remembered)) {
      let next: SelectedBuffer | null = saved;
      if (!openNetworks.has(networkId)) {
        next = null;
      } else if (saved.kind === 'buffer') {
        if (!domain.buffers.some((buffer) => buffer.id === saved.bufferId && buffer.networkId === networkId)) {
          next = null;
        }
      } else {
        const joined = domain.buffers.find((buffer) => buffer.networkId === networkId
          && buffer.kind === 'channel' && isSameIrcIdentifier(buffer.target, saved.channel));
        if (joined) {
          next = { kind: 'buffer', bufferId: joined.id };
        } else if (!domain.pendingChannels.some((pending) => pending.networkId === networkId
          && isSameIrcIdentifier(pending.channel, saved.channel))) {
          next = null;
        }
      }
      if (next !== saved) {
        if (remembered === previous.transient.lastSelectionByNetworkId) remembered = { ...remembered };
        if (next) remembered[networkId] = next;
        else delete remembered[networkId];
      }
    }
  }
  const networkId = selection?.kind === 'pending-channel'
    ? selection.networkId
    : selection ? domain.buffers.find((buffer) => buffer.id === selection.bufferId)?.networkId : null;
  if (networkId && selection && domain.networks.some((network) => network.id === networkId && network.workspaceOpen)) {
    const saved = remembered[networkId];
    const same = saved?.kind === 'buffer' && selection.kind === 'buffer'
      ? saved.bufferId === selection.bufferId
      : saved?.kind === 'pending-channel' && selection.kind === 'pending-channel'
        && isSameIrcIdentifier(saved.channel, selection.channel);
    if (!same) remembered = { ...remembered, [networkId]: selection };
  }
  return remembered;
};
