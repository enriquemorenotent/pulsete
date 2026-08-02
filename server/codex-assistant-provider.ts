import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serviceUnavailable } from './app-error.js';
import { readFailure, runCommand } from './codex-command-runner.js';
import type {
  AiAssistantLoginResponse,
  AiAssistantProviderStatus,
  AiAssistantSelection,
} from '../shared/protocol-ai.js';
import {
  readCodexAssistantModelCatalog,
  resolveCodexAssistantSelection,
  type CodexAssistantModelCatalog,
  type ResolvedCodexAssistantSelection,
} from './codex-assistant-models.js';
import {
  readCodexConnectionStatus,
  startCodexLogin,
  type CodexConnectionStatus,
  type CodexLoginProcess,
} from './codex-assistant-auth.js';

type CodexAssistantProviderResponse = {
  answer: string;
  status: AiAssistantProviderStatus;
};

export type CodexAssistantProvider = {
  model: string | null;
  request(input: {
    instructions: string;
    prompt: string;
    selection?: AiAssistantSelection;
  }): Promise<CodexAssistantProviderResponse>;
  startLogin(): Promise<AiAssistantLoginResponse>;
  status(): Promise<AiAssistantProviderStatus>;
};

type CodexProviderOptions = {
  command?: string;
  env?: NodeJS.ProcessEnv;
};

const modelCatalogCacheMs = 30_000;

export const createCodexAssistantProvider = (
  options: CodexProviderOptions = {},
): CodexAssistantProvider => {
  const command = options.command ?? 'codex';
  const env = options.env ?? process.env;
  const model = env.PULSETE_CODEX_MODEL?.trim() || null;
  const readModelCatalog = createModelCatalogReader(command);
  let activeLoginInstructions: string | null = null;
  let loginProcess: CodexLoginProcess | null = null;

  const status = () => readCodexProviderStatus(command, model, readModelCatalog);

  return {
    model,
    status,
    startLogin: async () => {
      const current = await status();
      if (current.connected) {
        activeLoginInstructions = null;
        return { instructions: null, status: current };
      }
      if (loginProcess && !loginProcess.killed) {
        return { instructions: activeLoginInstructions, status: current };
      }
      const response = await startCodexLogin(command, current, status, (process) => {
        loginProcess = process;
        process.once('exit', () => {
          if (loginProcess === process) {
            loginProcess = null;
            activeLoginInstructions = null;
          }
        });
      });
      activeLoginInstructions = response.instructions;
      return response;
    },
    request: async (input) => requestCodexAnswer(
      command,
      model,
      readModelCatalog,
      input,
    ),
  };
};

const readCodexProviderStatus = async (
  command: string,
  configuredModel: string | null,
  readModelCatalog: () => Promise<CodexAssistantModelCatalog>,
) => {
  const [connection, catalog] = await Promise.all([
    readCodexConnectionStatus(command),
    readModelCatalog(),
  ]);
  return buildProviderStatus(
    connection,
    catalog,
    resolveCodexAssistantSelection(catalog.models, configuredModel),
  );
};

const requestCodexAnswer = async (
  command: string,
  configuredModel: string | null,
  readModelCatalog: () => Promise<CodexAssistantModelCatalog>,
  input: {
    instructions: string;
    prompt: string;
    selection?: AiAssistantSelection;
  },
): Promise<CodexAssistantProviderResponse> => {
  const [connection, catalog] = await Promise.all([
    readCodexConnectionStatus(command),
    readModelCatalog(),
  ]);
  const selection = resolveCodexAssistantSelection(
    catalog.models,
    configuredModel,
    input.selection,
  );
  const providerStatus = buildProviderStatus(connection, catalog, selection);
  if (!providerStatus.connected) {
    throw serviceUnavailable(providerStatus.detail);
  }
  const dir = await mkdtemp(join(tmpdir(), 'pulsete-codex-assistant-'));
  const outputPath = join(dir, 'answer.txt');
  try {
    const args = buildCodexExecArgs(dir, outputPath, selection);
    const result = await runCommand(command, args, {
      input: buildCodexPrompt(input),
      timeoutMs: 120_000,
    });
    if (result.code !== 0) {
      throw serviceUnavailable(readFailure(result) ?? 'Codex assistant request failed');
    }
    return {
      answer: (await readFile(outputPath, 'utf8')).trim(),
      status: providerStatus,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

const buildCodexExecArgs = (
  dir: string,
  outputPath: string,
  selection: ResolvedCodexAssistantSelection,
) => [
  'exec',
  '--ephemeral',
  '--ignore-rules',
  '--ignore-user-config',
  '--skip-git-repo-check',
  '--sandbox',
  'read-only',
  '--cd',
  dir,
  '--output-last-message',
  outputPath,
  ...(selection.model ? ['--model', selection.model] : []),
  ...(selection.reasoningEffort ? [
    '--config',
    `model_reasoning_effort=${JSON.stringify(selection.reasoningEffort)}`,
  ] : []),
  '-',
];

const buildCodexPrompt = (input: { instructions: string; prompt: string }) => [
  'You are Pulsete Assistant, a private assistant inside an IRC client.',
  'Do not run shell commands. Use only the conversation context in the prompt.',
  'Return only the answer that should be shown to the user.',
  input.instructions,
  input.prompt,
].join('\n\n');

const createModelCatalogReader = (command: string) => {
  let cached: {
    expiresAt: number;
    value: CodexAssistantModelCatalog;
  } | null = null;
  return async () => {
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    const value = await readCodexAssistantModelCatalog(command);
    cached = {
      expiresAt: Date.now() + modelCatalogCacheMs,
      value,
    };
    return value;
  };
};

const buildProviderStatus = (
  connection: CodexConnectionStatus,
  catalog: CodexAssistantModelCatalog,
  selection: ResolvedCodexAssistantSelection,
): AiAssistantProviderStatus => ({
  ...connection,
  availableModels: catalog.models,
  model: selection.model,
  modelsError: catalog.error,
  reasoningEffort: selection.reasoningEffort,
  selectionNotice: selection.notice,
});
