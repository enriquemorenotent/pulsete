import { spawn } from 'node:child_process';
import { codexCommandEnvironment } from './codex-command-path.js';

export type CommandResult = {
  code: number | null;
  error?: NodeJS.ErrnoException;
  stderr: string;
  stdout: string;
};

export const runCommand = (
  command: string,
  args: string[],
  options: { input?: string; timeoutMs: number; signal?: AbortSignal; killGraceMs?: number; maxStdoutChars?: number },
) => new Promise<CommandResult>((resolve) => {
  const grouped = process.platform !== 'win32';
  const child = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'], detached: grouped, env: codexCommandEnvironment(command),
  });
  let settled = false;
  let stopping = false;
  let stderr = '';
  let stdout = '';
  let stopError: NodeJS.ErrnoException | undefined;
  let forceTimer: ReturnType<typeof setTimeout> | undefined;
  const kill = (signal: NodeJS.Signals) => {
    try {
      if (grouped && child.pid) process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch { /* The process may already have exited. */ }
  };
  const finish = (result: CommandResult) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    clearTimeout(forceTimer);
    options.signal?.removeEventListener('abort', cancel);
    resolve(result);
  };
  const stop = (code: string, message: string) => {
    if (settled || stopping) return;
    stopping = true;
    stopError = Object.assign(new Error(message), { code });
    kill('SIGTERM');
    forceTimer = setTimeout(() => {
      kill('SIGKILL');
      child.stdout.destroy();
      child.stderr.destroy();
      child.stdin.destroy();
      finish({ code: null, error: stopError, stderr, stdout });
    }, options.killGraceMs ?? 500);
  };
  const cancel = () => stop('ABORT_ERR', 'Assistant request cancelled');
  const timer = setTimeout(() => stop('ETIMEDOUT', 'Assistant request timed out'), options.timeoutMs);
  // Bound CLI diagnostics so a noisy or malfunctioning process cannot exhaust memory.
  child.stdout.on('data', (chunk) => { stdout = (stdout + chunk.toString('utf8')).slice(-(options.maxStdoutChars ?? 64_000)); });
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString('utf8')).slice(-64_000); });
  child.once('error', (error: NodeJS.ErrnoException) => {
    finish({ code: null, error, stderr, stdout });
  });
  child.once('close', (code) => {
    finish({ code: stopError ? null : code, error: stopError, stderr, stdout });
  });
  child.stdin.on('error', () => { /* Child exit/error is handled above, including EPIPE. */ });
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();
  child.stdin.end(options.input ?? '');
});

export const readFailure = (result: CommandResult) =>
  (result.error?.code === 'ETIMEDOUT' || result.error?.code === 'ABORT_ERR')
    ? result.error.message
    : stripAnsi(result.stderr || result.stdout).trim() || result.error?.message || null;

export const stripAnsi = (value: string) => value.replace(/\u001b\[[0-9;]*m/g, '');
