import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createCodexAssistantProvider } from '../server/codex-assistant-provider.js';

test('Codex assistant provider reports unavailable when Codex CLI is missing', async () => {
  const provider = createCodexAssistantProvider({
    command: 'pulsete-missing-codex-binary',
    env: { PULSETE_CODEX_MODEL: 'gpt-test' },
  });

  const status = await provider.status();

  assert.equal(status.connected, false);
  assert.equal(status.model, 'gpt-test');
  assert.equal(status.provider, 'unavailable');
  assert.match(status.detail, /Install Codex CLI/);
});

test('Codex assistant request fails through status when not connected', async () => {
  const provider = createCodexAssistantProvider({
    command: 'pulsete-missing-codex-binary',
  });

  await assert.rejects(
    () => provider.request({ instructions: 'Answer briefly.', prompt: 'Hello' }),
    /Install Codex CLI/,
  );
});

test('Codex assistant login keeps device instructions on repeated starts', async () => {
  const command = createFakeCodexCommand();
  const provider = createCodexAssistantProvider({ command });

  const first = await provider.startLogin();
  const second = await provider.startLogin();

  assert.match(first.instructions ?? '', /https:\/\/auth\.openai\.com\/codex\/device/);
  assert.match(first.instructions ?? '', /TEST-CODE/);
  assert.equal(second.instructions, first.instructions);
});

const createFakeCodexCommand = () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-codex-test-'));
  const command = join(dir, 'codex-fake.js');
  writeFileSync(command, [
    '#!/usr/bin/env node',
    'const args = process.argv.slice(2);',
    'if (args.join(" ") === "login status") { process.exit(1); }',
    'if (args.join(" ") === "login --device-auth") {',
    '  console.log("Open https://auth.openai.com/codex/device\\nEnter TEST-CODE");',
    '  setTimeout(() => process.exit(0), 500);',
    '}',
  ].join('\n'));
  chmodSync(command, 0o755);
  return command;
};
