import assert from 'node:assert/strict';
import test from 'node:test';
import { AssistantAppServer, buildAssistantAppServerSpawnArgs } from '../server/assistant-app-server.js';

test('assistant app-server spawn args override unsupported global reasoning defaults', () => {
  assert.deepEqual(buildAssistantAppServerSpawnArgs(), [
    '-c',
    'model_reasoning_effort="high"',
    '-c',
    'plan_mode_reasoning_effort="high"',
    'app-server',
    '--listen',
    'stdio://',
  ]);
});

test('assistant app-server child shutdown clears startup state and schedules a retry after spawn failure', () => {
  const appServer = new AssistantAppServer('0.1.0', false);
  const privateServer = appServer as unknown as {
    child: object | null;
    stdoutReader: { close(): void } | null;
    startupPromise: Promise<void> | null;
    restartTimer: ReturnType<typeof setTimeout> | null;
    handleChildClose: (
      child: object,
      stdoutReader: { close(): void },
      error: Error | null,
      code: number | null,
      signal: NodeJS.Signals | null,
      stderrText: string,
    ) => void;
  };
  const fakeChild = {};
  let readerClosed = false;
  const fakeReader = {
    close: () => {
      readerClosed = true;
    },
  };
  const errors: Array<Error | null> = [];

  appServer.on('unavailable', (error) => {
    errors.push(error);
  });
  privateServer.child = fakeChild;
  privateServer.stdoutReader = fakeReader;
  privateServer.startupPromise = Promise.resolve();

  privateServer.handleChildClose(fakeChild, fakeReader, new Error('ENOENT'), 1, null, '');

  assert.equal(privateServer.child, null);
  assert.equal(privateServer.stdoutReader, null);
  assert.equal(privateServer.startupPromise, null);
  assert.equal(readerClosed, true);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.message, 'ENOENT');
  assert.notEqual(privateServer.restartTimer, null);

  appServer.close();
});

test('assistant app-server reports clean child exits as unavailable errors', () => {
  const appServer = new AssistantAppServer('0.1.0', false);
  const privateServer = appServer as unknown as {
    child: object | null;
    stdoutReader: { close(): void } | null;
    startupPromise: Promise<void> | null;
    restartTimer: ReturnType<typeof setTimeout> | null;
    handleChildClose: (
      child: object,
      stdoutReader: { close(): void },
      error: Error | null,
      code: number | null,
      signal: NodeJS.Signals | null,
      stderrText: string,
    ) => void;
  };
  const fakeChild = {};
  const fakeReader = { close: () => {} };
  const errors: Array<Error | null> = [];

  appServer.on('unavailable', (error) => {
    errors.push(error);
  });
  privateServer.child = fakeChild;
  privateServer.stdoutReader = fakeReader;
  privateServer.startupPromise = Promise.resolve();

  privateServer.handleChildClose(fakeChild, fakeReader, null, 2, null, 'unknown subcommand: app-server');

  assert.equal(errors.length, 1);
  assert.equal(
    errors[0]?.message,
    'Assistant app-server exited with code 2: unknown subcommand: app-server',
  );
  assert.notEqual(privateServer.restartTimer, null);

  appServer.close();
});
