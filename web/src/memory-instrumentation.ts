import { useEffect } from 'react';

export type TranscriptInstrumentationSnapshot = {
  bufferId: string | null;
  groups: number;
  kind: string | null;
  messages: number;
  mutedGroups: number;
  rows: number;
  serverGroups: number;
  target: string | null;
  unreadRowIndex: number | null;
};

export type MemoryInstrumentationSnapshot = {
  actionCounts: Record<string, number>;
  dispatches: number;
  renderCommitCounts: Record<string, number>;
  renderCommits: number;
  stateChangingDispatches: number;
  transcript: TranscriptInstrumentationSnapshot | null;
  websocketMessageCounts: Record<string, number>;
  websocketPayloadBytes: number;
  websocketMessages: number;
};

const actionCounts: Record<string, number> = {};
const renderCommitCounts: Record<string, number> = {};
const websocketMessageCounts: Record<string, number> = {};
let dispatches = 0;
let renderCommits = 0;
let stateChangingDispatches = 0;
let transcript: TranscriptInstrumentationSnapshot | null = null;
let websocketPayloadBytes = 0;
let websocketMessages = 0;

export const recordDiagnosticAction = (type: string, changed: boolean) => {
  dispatches += 1;
  actionCounts[type] = (actionCounts[type] ?? 0) + 1;
  if (changed) {
    stateChangingDispatches += 1;
  }
};

export const recordDiagnosticWebsocketMessage = (type: string, payloadBytes = 0) => {
  websocketMessages += 1;
  websocketPayloadBytes += Math.max(0, payloadBytes);
  websocketMessageCounts[type] = (websocketMessageCounts[type] ?? 0) + 1;
};

export const recordDiagnosticRenderCommit = (name: string) => {
  renderCommits += 1;
  renderCommitCounts[name] = (renderCommitCounts[name] ?? 0) + 1;
};

export const recordDiagnosticTranscript = (
  snapshot: TranscriptInstrumentationSnapshot,
) => {
  transcript = snapshot;
};

export const useDiagnosticRenderCounter = (name: string) => {
  useEffect(() => {
    recordDiagnosticRenderCommit(name);
  });
};

export const readMemoryInstrumentationSnapshot = (): MemoryInstrumentationSnapshot => ({
  actionCounts: { ...actionCounts },
  dispatches,
  renderCommitCounts: { ...renderCommitCounts },
  renderCommits,
  stateChangingDispatches,
  transcript: transcript ? { ...transcript } : null,
  websocketMessageCounts: { ...websocketMessageCounts },
  websocketPayloadBytes,
  websocketMessages,
});
