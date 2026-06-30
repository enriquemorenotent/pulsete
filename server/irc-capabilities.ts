import { resolveNetworkAuthMethod } from '../shared/network-model.js';
import type { NetworkRuntimeCapabilities } from '../shared/protocol-chat.js';
import type { RuntimeNetworkProfile } from './storage-types.js';
import { shouldRequestBatchCapability } from './irc-history.js';
import type { IrcCapabilityState } from './irc-state-types.js';

const passiveCapabilityNames = [
  'account-tag',
  'account-notify',
  'away-notify',
  'chghost',
  'echo-message',
  'extended-join',
  'extended-monitor',
  'message-tags',
  'multi-prefix',
  'server-time',
  'setname',
  'standard-replies',
  'userhost-in-names',
] as const;

type SupportedCapabilityName =
  | (typeof passiveCapabilityNames)[number]
  | 'batch'
  | 'chathistory'
  | 'draft/chathistory'
  | 'labeled-response'
  | 'sasl';

type CapabilityOfferTarget = Pick<IrcCapabilityState, 'offered' | 'values'> | Set<string>;

export const parseCapabilityTokens = (value: string | undefined) =>
  (value ?? '')
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

export const normalizeCapabilityName = (token: string) =>
  token.replace(/^-/, '').split('=', 1)[0]?.trim().toLowerCase() ?? '';

const parseCapabilityValue = (token: string) => {
  const separatorIndex = token.indexOf('=');
  return separatorIndex === -1 ? null : token.slice(separatorIndex + 1).trim();
};

export const recordAdvertisedCapabilities = (target: CapabilityOfferTarget, tokens: readonly string[]) => {
  const offered = target instanceof Set ? target : target.offered;
  for (const token of tokens) {
    const name = normalizeCapabilityName(token);
    if (name) {
      offered.add(name);
      const value = parseCapabilityValue(token);
      if (!(target instanceof Set) && value !== null) {
        target.values.set(name, value);
      }
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
  if (offered.has('batch') && offered.has('draft/chathistory')) {
    requested.add('draft/chathistory');
  } else if (offered.has('batch') && offered.has('chathistory')) {
    requested.add('chathistory');
  }
  if (shouldRequestBatchCapability(offered, requested)) {
    requested.add('batch');
  }
  if (offered.has('labeled-response') && requested.has('batch')) {
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
      state.values.delete(name);
    } else {
      state.negotiated.add(name);
      const value = parseCapabilityValue(token);
      if (value !== null) {
        state.values.set(name, value);
      }
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
  state: Pick<IrcCapabilityState, 'negotiated' | 'offered' | 'pendingRequest'> & {
    values?: ReadonlyMap<string, string>;
  },
): NetworkRuntimeCapabilities => {
  const values = state.values ? listCapabilityValues(state.values) : {};
  return {
    offered: listSortedCapabilityNames(state.offered),
    negotiated: listSortedCapabilityNames(state.negotiated),
    pending: listSortedCapabilityNames(state.pendingRequest),
    ...(Object.keys(values).length > 0 ? { values } : {}),
  };
};

const listSortedCapabilityNames = (capabilities: ReadonlySet<string>) =>
  Array.from(capabilities).sort((left, right) => left.localeCompare(right));

const listCapabilityValues = (values: ReadonlyMap<string, string>) =>
  Object.fromEntries(
    Array.from(values.entries()).sort(([left], [right]) => left.localeCompare(right))
  );
