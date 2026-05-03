import { resolveNetworkAuthMethod } from '../shared/network-model.js';
import type { NetworkRuntimeCapabilities } from '../shared/protocol.js';
import type { RuntimeNetworkProfile } from './storage-types.js';
import type { IrcCapabilityState } from './irc-state-types.js';

const passiveCapabilityNames = [
  'account-notify',
  'away-notify',
  'chghost',
  'echo-message',
  'extended-join',
  'message-tags',
  'server-time',
  'setname',
  'standard-replies',
  'userhost-in-names',
] as const;

type SupportedCapabilityName = (typeof passiveCapabilityNames)[number] | 'batch' | 'labeled-response' | 'sasl';

type CapabilityOfferTarget = Pick<IrcCapabilityState, 'offered'> | Set<string>;

export const parseCapabilityTokens = (value: string | undefined) =>
  (value ?? '')
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

export const normalizeCapabilityName = (token: string) =>
  token.replace(/^-/, '').split('=', 1)[0]?.trim().toLowerCase() ?? '';

export const recordAdvertisedCapabilities = (target: CapabilityOfferTarget, tokens: readonly string[]) => {
  const offered = target instanceof Set ? target : target.offered;
  for (const token of tokens) {
    const name = normalizeCapabilityName(token);
    if (name) {
      offered.add(name);
    }
  }
};

export const resolveRequestedCapabilities = (
  profile: RuntimeNetworkProfile,
  offered: ReadonlySet<string>,
) => {
  const requested = new Set<string>();
  for (const capability of passiveCapabilityNames) {
    if (offered.has(capability)) {
      requested.add(capability);
    }
  }
  if (offered.has('labeled-response') && offered.has('batch')) {
    requested.add('batch');
    requested.add('labeled-response');
  }
  if (usesSaslPlain(profile) && offered.has('sasl')) {
    requested.add('sasl');
  }
  return requested;
};

export const applyAcknowledgedCapabilities = (
  state: IrcCapabilityState,
  tokens: readonly string[],
) => {
  for (const token of tokens) {
    const removed = token.startsWith('-');
    const name = normalizeCapabilityName(token);
    if (!name) {
      continue;
    }
    state.pendingRequest.delete(name);
    if (removed) {
      state.negotiated.delete(name);
    } else {
      state.negotiated.add(name);
    }
  }
};

export const usesSaslPlain = (profile: RuntimeNetworkProfile) =>
  resolveNetworkAuthMethod(profile) === 'sasl-plain' && Boolean(profile.password);

export const hasNegotiatedCapability = (
  state: Pick<IrcCapabilityState, 'negotiated'>,
  capability: SupportedCapabilityName | string,
) => state.negotiated.has(capability);

export const snapshotIrcCapabilities = (
  state: Pick<IrcCapabilityState, 'negotiated' | 'offered' | 'pendingRequest'>,
): NetworkRuntimeCapabilities => ({
  offered: listSortedCapabilityNames(state.offered),
  negotiated: listSortedCapabilityNames(state.negotiated),
  pending: listSortedCapabilityNames(state.pendingRequest),
});

const listSortedCapabilityNames = (capabilities: ReadonlySet<string>) =>
  Array.from(capabilities).sort((left, right) => left.localeCompare(right));
