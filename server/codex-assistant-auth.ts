import { spawn } from 'node:child_process';
import type {
  AiAssistantLoginResponse,
  AiAssistantProviderStatus,
} from '../shared/protocol-ai.js';
import { serviceUnavailable } from './app-error.js';
import { runCommand, stripAnsi } from './codex-command-runner.js';

const codexProviderName = 'codex-openai-login' as const;

export type CodexConnectionStatus = Pick<
  AiAssistantProviderStatus,
  'connected' | 'detail' | 'provider'
>;

export type CodexLoginProcess = ReturnType<typeof spawn>;

export const readCodexConnectionStatus = async (
  command: string,
): Promise<CodexConnectionStatus> => {
  const result = await runCommand(command, ['login', 'status'], { timeoutMs: 10_000 });
  if (result.error?.code === 'ENOENT') {
    return {
      connected: false,
      detail: 'Install Codex CLI and sign in with OpenAI to enable assistant requests.',
      provider: 'unavailable',
    };
  }
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.code === 0 && /logged in/i.test(output)) {
    return {
      connected: true,
      detail: 'Codex OpenAI login connected',
      provider: codexProviderName,
    };
  }
  return {
    connected: false,
    detail: 'Sign in with OpenAI through Codex to use the assistant.',
    provider: codexProviderName,
  };
};

export const startCodexLogin = (
  command: string,
  currentStatus: AiAssistantProviderStatus,
  readStatus: () => Promise<AiAssistantProviderStatus>,
  onProcess: (process: CodexLoginProcess) => void,
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
        ...currentStatus,
        detail: 'Complete the Codex OpenAI login in your browser.',
        connected: false,
        provider: codexProviderName,
      });
    }
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  child.once('error', (error: NodeJS.ErrnoException) => {
    reject(serviceUnavailable(
      error.code === 'ENOENT' ? 'Codex CLI is not installed' : error.message,
    ));
  });
  child.once('exit', (code) => {
    if (settled) {
      return;
    }
    if (code !== 0) {
      reject(serviceUnavailable('Codex OpenAI login could not be started'));
      return;
    }
    void readStatus().then(
      (status) => settle(null, status),
      () => reject(serviceUnavailable('Codex OpenAI login status could not be checked')),
    );
  });
});
