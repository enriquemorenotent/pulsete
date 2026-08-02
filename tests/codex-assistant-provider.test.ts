import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

test('Codex assistant provider discovers the current visible model family', async () => {
  const fake = createConnectedFakeCodexCommand();
  const provider = createCodexAssistantProvider({
    command: fake.command,
    env: { PULSETE_CODEX_MODEL: 'gpt-5.6-terra' },
  });

  const status = await provider.status();

  assert.equal(status.connected, true);
  assert.equal(status.model, 'gpt-5.6-terra');
  assert.equal(status.reasoningEffort, 'medium');
  assert.deepEqual(
    status.availableModels.map(({ id }) => id),
    ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
  );
  assert.deepEqual(
    status.availableModels[1]?.reasoningEfforts,
    ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
  );
});

test('Codex assistant provider applies a validated model and reasoning effort per request', async () => {
  const fake = createConnectedFakeCodexCommand();
  const provider = createCodexAssistantProvider({ command: fake.command, env: {} });

  const response = await provider.request({
    instructions: 'Answer briefly.',
    prompt: 'Hello',
    selection: { model: 'gpt-5.6-terra', reasoningEffort: 'ultra' },
  });
  const args = JSON.parse(readFileSync(fake.argsPath, 'utf8')) as string[];

  assert.equal(response.answer, 'Test answer');
  assert.equal(response.status.model, 'gpt-5.6-terra');
  assert.equal(response.status.reasoningEffort, 'ultra');
  assert.deepEqual(args.slice(args.indexOf('--model'), args.indexOf('--model') + 2), [
    '--model',
    'gpt-5.6-terra',
  ]);
  assert.deepEqual(args.slice(args.indexOf('--config'), args.indexOf('--config') + 2), [
    '--config',
    'model_reasoning_effort="ultra"',
  ]);
});

test('Codex assistant provider safely replaces an unsupported saved effort', async () => {
  const fake = createConnectedFakeCodexCommand();
  const provider = createCodexAssistantProvider({ command: fake.command, env: {} });

  const response = await provider.request({
    instructions: 'Answer briefly.',
    prompt: 'Hello',
    selection: { model: 'gpt-5.6-luna', reasoningEffort: 'ultra' },
  });
  const args = JSON.parse(readFileSync(fake.argsPath, 'utf8')) as string[];

  assert.equal(response.status.model, 'gpt-5.6-luna');
  assert.equal(response.status.reasoningEffort, 'medium');
  assert.match(response.status.selectionNotice ?? '', /reasoning effort ultra is unavailable/);
  assert.ok(args.includes('model_reasoning_effort="medium"'));
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

const createConnectedFakeCodexCommand = () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-codex-connected-test-'));
  const command = join(dir, 'codex-fake.js');
  const argsPath = join(dir, 'exec-args.json');
  const modelsJson = JSON.stringify({
    models: [
      createModel('gpt-5.6-sol', 'GPT-5.6-Sol', 'low', [
        'low', 'medium', 'high', 'xhigh', 'max', 'ultra',
      ], 1),
      createModel('gpt-5.6-terra', 'GPT-5.6-Terra', 'medium', [
        'low', 'medium', 'high', 'xhigh', 'max', 'ultra',
      ], 2),
      createModel('codex-auto-review', 'Codex Auto Review', 'medium', ['medium'], 3, 'hide'),
      createModel('gpt-5.6-luna', 'GPT-5.6-Luna', 'medium', [
        'low', 'medium', 'high', 'xhigh', 'max',
      ], 3),
      createModel('gpt-5.5', 'GPT-5.5', 'medium', ['low', 'medium', 'high'], 7),
    ],
  });
  writeFileSync(command, [
    '#!/usr/bin/env node',
    'const { writeFileSync } = require("node:fs");',
    'const args = process.argv.slice(2);',
    'if (args.join(" ") === "login status") { console.log("Logged in"); process.exit(0); }',
    `if (args.join(" ") === "debug models") { console.log(${JSON.stringify(modelsJson)}); process.exit(0); }`,
    'if (args[0] === "exec") {',
    `  writeFileSync(${JSON.stringify(argsPath)}, JSON.stringify(args));`,
    '  const outputIndex = args.indexOf("--output-last-message");',
    '  writeFileSync(args[outputIndex + 1], "Test answer");',
    '  process.exit(0);',
    '}',
    'process.exit(1);',
  ].join('\n'));
  chmodSync(command, 0o755);
  return { argsPath, command };
};

const createModel = (
  slug: string,
  displayName: string,
  defaultReasoningLevel: string,
  efforts: string[],
  priority: number,
  visibility = 'list',
) => ({
  default_reasoning_level: defaultReasoningLevel,
  display_name: displayName,
  priority,
  slug,
  supported_reasoning_levels: efforts.map((effort) => ({ effort })),
  visibility,
});
