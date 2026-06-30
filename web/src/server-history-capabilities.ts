import { emptyNetworkRuntimeCapabilities, type NetworkRuntimeCapabilities } from '../../shared/protocol-chat.js';

type CapabilityAvailability = 'active' | 'pending' | 'offered' | 'missing';

type CapabilitySummary = {
  backfill: string;
  endMarker: string;
  eventReplay: string;
  pageSize: string;
  retention: string;
};

const capabilityAvailabilityLabels: Record<CapabilityAvailability, string> = {
  active: 'Supported',
  pending: 'Pending',
  offered: 'Offered by server',
  missing: 'Not advertised',
};

const historyBackfillCapabilityNames = ['chathistory', 'draft/chathistory'];
const historyEndCapabilityNames = ['chathistory-end', 'draft/chathistory-end'];
const historyEventReplayCapabilityNames = ['event-playback', 'draft/event-playback'];

const capabilityAvailabilitySources: Array<{
  availability: CapabilityAvailability;
  field: 'negotiated' | 'pending' | 'offered';
}> = [
  { availability: 'active', field: 'negotiated' },
  { availability: 'pending', field: 'pending' },
  { availability: 'offered', field: 'offered' },
];

export const summarizeHistoryCapabilities = (
  capabilitiesInput?: NetworkRuntimeCapabilities | null,
): CapabilitySummary => {
  const capabilities = capabilitiesInput ?? emptyNetworkRuntimeCapabilities();
  const backfill = resolveCapabilityAvailability(capabilities, historyBackfillCapabilityNames);
  const endMarker = resolveCapabilityAvailability(capabilities, historyEndCapabilityNames);
  const eventReplay = resolveCapabilityAvailability(capabilities, historyEventReplayCapabilityNames);
  return {
    backfill: capabilityAvailabilityLabels[backfill.availability],
    pageSize: formatHistoryPageSize(resolveHistoryPageSizeValue(capabilities, backfill.name)),
    endMarker: capabilityAvailabilityLabels[endMarker.availability],
    eventReplay: capabilityAvailabilityLabels[eventReplay.availability],
    retention: 'Not advertised',
  };
};

const resolveCapabilityAvailability = (
  capabilities: NetworkRuntimeCapabilities,
  names: readonly string[],
) => {
  const nameSet = new Set(names);
  for (const source of capabilityAvailabilitySources) {
    const name = capabilities[source.field].find((capability) => nameSet.has(capability));
    if (name) {
      return { availability: source.availability, name };
    }
  }
  return { availability: 'missing' as const, name: null };
};

const formatHistoryPageSize = (value: string | undefined) => {
  if (!value) {
    return 'Not advertised';
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isInteger(parsed) && parsed > 0 && String(parsed) === value) {
    return `Up to ${parsed} messages`;
  }
  return value;
};

const resolveHistoryPageSizeValue = (
  capabilities: NetworkRuntimeCapabilities,
  backfillName: string | null,
) => capabilities.values?.['isupport/chathistory']
  ?? (backfillName ? capabilities.values?.[backfillName] : undefined);
