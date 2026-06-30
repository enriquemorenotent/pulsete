import { spawn } from 'node:child_process';

export type CommandResult = {
  code: number | null;
  error?: NodeJS.ErrnoException;
  stderr: string;
  stdout: string;
};

export const runCommand = (
  command: string,
  args: string[],
  options: { input?: string; timeoutMs: number },
) => new Promise<CommandResult>((resolve) => {
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let settled = false;
  let stderr = '';
  let stdout = '';
  const finish = (result: CommandResult) => {
    if (!settled) {
      settled = true;
      resolve(result);
    }
  };
  const timer = setTimeout(() => child.kill('SIGTERM'), options.timeoutMs);
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString('utf8');
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8');
  });
  child.once('error', (error: NodeJS.ErrnoException) => {
    clearTimeout(timer);
    finish({ code: null, error, stderr, stdout });
  });
  child.once('close', (code) => {
    clearTimeout(timer);
    finish({ code, stderr, stdout });
  });
  child.stdin.end(options.input ?? '');
});

export const readFailure = (result: CommandResult) =>
  stripAnsi(result.stderr || result.stdout).trim() || result.error?.message || null;

export const stripAnsi = (value: string) =>
  value.replace(/\u001b\[[0-9;]*m/g, '');
