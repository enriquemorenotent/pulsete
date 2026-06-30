import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serviceUnavailable } from './app-error.js';
import { readFailure, runCommand, stripAnsi } from './codex-command-runner.js';
import type {
  AiAssistantLoginResponse,
  AiAssistantProviderStatus,
} from '../shared/protocol-ai.js';

export type CodexAssistantProvider = {
  model: string | null;
  request(input: { instructions: string; prompt: string }): Promise<string>;
  startLogin(): Promise<AiAssistantLoginResponse>;
  status(): Promise<AiAssistantProviderStatus>;
};

type CodexProviderOptions = {
  command?: string;
  env?: NodeJS.ProcessEnv;
};

const codexProviderName = 'codex-openai-login' as const;

export const createCodexAssistantProvider = (
  options: CodexProviderOptions = {},
): CodexAssistantProvider => {
  const command = options.command ?? 'codex';
  const env = options.env ?? process.env;
  const model = env.PULSETE_CODEX_MODEL?.trim() || null;
  let activeLoginInstructions: string | null = null;
  let loginProcess: ReturnType<typeof spawn> | null = null;

  const status = () => readCodexLoginStatus(command, model);

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
      const response = await startCodexLogin(command, model, (process) => {
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
    request: async (input) => requestCodexAnswer(command, model, input),
  };
};

const readCodexLoginStatus = async (
  command: string,
  model: string | null,
): Promise<AiAssistantProviderStatus> => {
  const result = await runCommand(command, ['login', 'status'], { timeoutMs: 10_000 });
  if (result.error?.code === 'ENOENT') {
    return unavailableStatus('Install Codex CLI and sign in with OpenAI to enable assistant requests.', model);
  }
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.code === 0 && /logged in/i.test(output)) {
    return {
      connected: true,
      detail: 'Codex OpenAI login connected',
      model,
      provider: codexProviderName,
    };
  }
  return {
    connected: false,
    detail: 'Sign in with OpenAI through Codex to use the assistant.',
    model,
    provider: codexProviderName,
  };
};

const startCodexLogin = (
  command: string,
  model: string | null,
  onProcess: (process: ReturnType<typeof spawn>) => void,
) => new Promise<AiAssistantLoginResponse>((resolve, reject) => {
  const child = spawn(command, ['login', '--device-auth'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let settled = false;
  let output = '';
  onProcess(child);
  const settle = (instructions: string | null, status: AiAssistantProviderStatus) => {
    if (!settled) {
      settled = true;
      resolve({ instructions, status });
    }
  };
  const collect = (chunk: Buffer) => {
    output += stripAnsi(chunk.toString('utf8'));
    if (output.includes('https://auth.openai.com/codex/device')) {
      settle(output.trim(), {
        connected: false,
        detail: 'Complete the Codex OpenAI login in your browser.',
        model,
        provider: codexProviderName,
      });
    }
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  child.once('error', (error: NodeJS.ErrnoException) => {
    reject(serviceUnavailable(error.code === 'ENOENT' ? 'Codex CLI is not installed' : error.message));
  });
  child.once('exit', (code) => {
    if (settled) {
      return;
    }
    if (code !== 0) {
      reject(serviceUnavailable('Codex OpenAI login could not be started'));
      return;
    }
    void readCodexLoginStatus(command, model).then(
      (status) => settle(null, status),
      () => reject(serviceUnavailable('Codex OpenAI login status could not be checked')),
    );
  });
});

const requestCodexAnswer = async (
  command: string,
  model: string | null,
  input: { instructions: string; prompt: string },
) => {
  const status = await readCodexLoginStatus(command, model);
  if (!status.connected) {
    throw serviceUnavailable(status.detail);
  }
  const dir = await mkdtemp(join(tmpdir(), 'pulsete-codex-assistant-'));
  const outputPath = join(dir, 'answer.txt');
  try {
    const args = buildCodexExecArgs(dir, outputPath, model);
    const result = await runCommand(command, args, {
      input: buildCodexPrompt(input),
      timeoutMs: 120_000,
    });
    if (result.code !== 0) {
      throw serviceUnavailable(readFailure(result) ?? 'Codex assistant request failed');
    }
    return (await readFile(outputPath, 'utf8')).trim();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

const buildCodexExecArgs = (dir: string, outputPath: string, model: string | null) => [
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
  ...(model ? ['--model', model] : []),
  '-',
];

const buildCodexPrompt = (input: { instructions: string; prompt: string }) => [
  'You are Pulsete Assistant, a private assistant inside an IRC client.',
  'Do not run shell commands. Use only the conversation context in the prompt.',
  'Return only the answer that should be shown to the user.',
  input.instructions,
  input.prompt,
].join('\n\n');

const unavailableStatus = (
  detail: string,
  model: string | null,
): AiAssistantProviderStatus => ({
  connected: false,
  detail,
  model,
  provider: 'unavailable',
});
