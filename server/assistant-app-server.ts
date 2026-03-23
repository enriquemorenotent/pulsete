import { EventEmitter } from 'node:events';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';

type JsonRpcResponse = {
  id: number;
  result?: unknown;
  error?: { code?: number; message?: string };
};

type JsonRpcNotification = {
  method: string;
  params?: unknown;
};

type JsonRpcRequest = {
  id: number;
  method: string;
  params?: unknown;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type AppServerEvents = {
  notification: [JsonRpcNotification];
  ready: [];
  unavailable: [Error | null];
};

const restartDelayMs = 1_000;

export class AssistantAppServer extends EventEmitter<AppServerEvents> {
  private child: ChildProcessWithoutNullStreams | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private stdoutReader: Interface | null = null;
  private nextId = 1;
  private ready = false;
  private stopped = false;
  private pending = new Map<number, PendingRequest>();
  private startupPromise: Promise<void> | null = null;

  constructor(
    private readonly version = '0.1.0',
    autoStart = true
  ) {
    super();
    if (autoStart) {
      this.start();
    }
  }

  close() {
    this.stopped = true;
    this.ready = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.stdoutReader?.close();
    this.stdoutReader = null;
    this.child?.kill();
    this.child = null;
    this.startupPromise = null;
    this.rejectPending(new Error('Assistant app-server closed'));
  }

  async call<T>(method: string, params?: unknown): Promise<T> {
    await this.waitForReady();
    return this.sendRequest<T>(method, params);
  }

  private start() {
    if (this.stopped || this.startupPromise) {
      return;
    }
    const startup = this.spawnAndInitialize();
    this.startupPromise = startup;
    void startup.catch((error) => {
      if (this.stopped) {
        return;
      }
      if (this.startupPromise !== startup) {
        return;
      }
      if (this.child) {
        this.child.kill();
        return;
      }
      this.startupPromise = null;
      this.emit('unavailable', toError(error));
      this.scheduleRestart();
    });
  }

  private async spawnAndInitialize() {
    this.ready = false;
    this.rejectPending(new Error('Assistant app-server restarted'));
    const child = spawn('codex', ['app-server', '--listen', 'stdio://'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    const stdoutReader = createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });
    this.stdoutReader = stdoutReader;
    let childError: Error | null = null;
    let stderrText = '';

    stdoutReader.on('line', (line) => this.handleLine(line));
    child.stderr.on('data', (chunk) => {
      // Stderr can contain progress or warnings; keep the tail for startup diagnostics.
      stderrText = `${stderrText}${chunk.toString()}`.slice(-4_000);
    });
    child.once('error', (error) => {
      childError = this.handleChildError(error);
    });
    child.once('close', (code, signal) => {
      this.handleChildClose(child, stdoutReader, childError, code, signal, stderrText);
    });

    await this.sendRequest('initialize', {
      clientInfo: {
        name: 'pulsete_assistant',
        title: 'Pulsete Assistant',
        version: this.version,
      },
    });
    this.sendNotification('initialized', {});
    this.ready = true;
    this.emit('ready');
  }

  private handleChildError(error: unknown) {
    this.ready = false;
    return toError(error);
  }

  private handleChildClose(
    child: ChildProcessWithoutNullStreams,
    stdoutReader: Interface,
    error: Error | null,
    code: number | null,
    signal: NodeJS.Signals | null,
    stderrText: string,
  ) {
    const closeError = error ?? buildChildCloseError(code, signal, stderrText);
    this.ready = false;
    this.startupPromise = null;
    stdoutReader.close();
    if (this.stdoutReader === stdoutReader) {
      this.stdoutReader = null;
    }
    if (this.child === child) {
      this.child = null;
    }
    this.rejectPending(closeError ?? new Error('Assistant app-server closed'));
    if (this.stopped) {
      return;
    }
    this.emit('unavailable', closeError);
    this.scheduleRestart();
  }

  private scheduleRestart() {
    if (this.restartTimer || this.stopped) {
      return;
    }
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.start();
    }, restartDelayMs);
  }

  private async waitForReady() {
    if (this.ready) {
      return;
    }
    if (!this.startupPromise) {
      this.start();
    }
    await this.startupPromise;
  }

  private sendNotification(method: string, params?: unknown) {
    if (!this.child?.stdin.writable) {
      throw new Error('Assistant app-server is not writable');
    }
    this.child.stdin.write(JSON.stringify({ method, params }) + '\n');
  }

  private sendRequest<T>(method: string, params?: unknown): Promise<T> {
    const id = this.nextId++;
    if (!this.child?.stdin.writable) {
      return Promise.reject(new Error('Assistant app-server is not running'));
    }
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      });
      this.child?.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }

  private handleLine(line: string) {
    let message: JsonRpcNotification | JsonRpcRequest | JsonRpcResponse;
    try {
      message = JSON.parse(line) as JsonRpcNotification | JsonRpcRequest | JsonRpcResponse;
    } catch {
      return;
    }
    if ('id' in message && ('result' in message || 'error' in message) && !('method' in message)) {
      this.handleResponse(message);
      return;
    }
    if ('method' in message && 'id' in message && typeof message.id === 'number') {
      this.handleServerRequest(message as JsonRpcRequest);
      return;
    }
    if ('method' in message) {
      this.emit('notification', message);
    }
  }

  private handleResponse(message: JsonRpcResponse) {
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message || 'Assistant app-server request failed'));
      return;
    }
    pending.resolve(message.result);
  }

  private handleServerRequest(message: JsonRpcRequest) {
    if (!this.child?.stdin.writable) {
      return;
    }
    this.child.stdin.write(JSON.stringify({
      id: message.id,
      error: {
        code: -32601,
        message: `${message.method} is not supported by Pulsete`,
      },
    }) + '\n');
  }

  private rejectPending(error: Error) {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}

const toError = (error: unknown) => error instanceof Error ? error : new Error(String(error));

const buildChildCloseError = (
  code: number | null,
  signal: NodeJS.Signals | null,
  stderrText: string
) => {
  const detail = stderrText.trim().split('\n').map((line) => line.trim()).filter(Boolean).at(-1) ?? null;
  const summary = signal
    ? `Assistant app-server exited via signal ${signal}`
    : code === null
      ? 'Assistant app-server closed unexpectedly'
      : `Assistant app-server exited with code ${code}`;
  return detail ? new Error(`${summary}: ${detail}`) : new Error(summary);
};
