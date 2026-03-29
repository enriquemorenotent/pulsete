import type { ChildProcessWithoutNullStreams } from 'node:child_process';

export type JsonRpcResponse = {
  id: number;
  result?: unknown;
  error?: { code?: number; message?: string };
};

export type JsonRpcNotification = {
  method: string;
  params?: unknown;
};

export type JsonRpcRequest = {
  id: number;
  method: string;
  params?: unknown;
};

export type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

const assistantAppServerConfigOverrides = [
  'model_reasoning_effort="high"',
  'plan_mode_reasoning_effort="high"',
] as const;

export const assistantAppServerRestartDelayMs = 1_000;

export const buildAssistantAppServerSpawnArgs = () => ([
  ...assistantAppServerConfigOverrides.flatMap((override) => ['-c', override]),
  'app-server',
  '--listen',
  'stdio://',
]);

export const toAssistantAppServerError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

export const buildAssistantAppServerCloseError = (
  code: number | null,
  signal: NodeJS.Signals | null,
  stderrText: string,
) => {
  const detail = stderrText
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1) ?? null;
  const summary = signal
    ? `Assistant app-server exited via signal ${signal}`
    : code === null
      ? 'Assistant app-server closed unexpectedly'
      : `Assistant app-server exited with code ${code}`;
  return detail ? new Error(`${summary}: ${detail}`) : new Error(summary);
};

export type AssistantAppServerChild = ChildProcessWithoutNullStreams;
