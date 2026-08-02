import assert from 'node:assert/strict';
import test from 'node:test';
import type { AiAssistantProviderStatus } from '../shared/protocol-ai.js';
import {
  resolveAiAssistantSelection,
} from '../web/src/ai-assistant-model-selection.js';

const status: AiAssistantProviderStatus = {
  availableModels: [
    {
      defaultReasoningEffort: 'low',
      id: 'gpt-5.6-sol',
      label: 'GPT-5.6-Sol',
      reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
    },
    {
      defaultReasoningEffort: 'medium',
      id: 'gpt-5.6-luna',
      label: 'GPT-5.6-Luna',
      reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    },
  ],
  connected: true,
  detail: 'connected',
  model: 'gpt-5.6-sol',
  modelsError: null,
  provider: 'codex-openai-login',
  reasoningEffort: 'low',
  selectionNotice: null,
};

test('assistant selection keeps a supported saved model and effort', () => {
  const resolved = resolveAiAssistantSelection(status, {
    model: 'gpt-5.6-luna',
    reasoningEffort: 'high',
  });

  assert.deepEqual(resolved.selection, {
    model: 'gpt-5.6-luna',
    reasoningEffort: 'high',
  });
  assert.equal(resolved.notice, null);
});

test('assistant selection falls back when a saved effort is unavailable for its model', () => {
  const resolved = resolveAiAssistantSelection(status, {
    model: 'gpt-5.6-luna',
    reasoningEffort: 'ultra',
  });

  assert.deepEqual(resolved.selection, {
    model: 'gpt-5.6-luna',
    reasoningEffort: 'medium',
  });
  assert.match(resolved.notice ?? '', /Saved reasoning unavailable/);
});

test('assistant selection falls back to the provider default for a removed model', () => {
  const resolved = resolveAiAssistantSelection(status, {
    model: 'gpt-5.6-retired',
    reasoningEffort: 'ultra',
  });

  assert.deepEqual(resolved.selection, {
    model: 'gpt-5.6-sol',
    reasoningEffort: 'ultra',
  });
  assert.match(resolved.notice ?? '', /Saved model unavailable/);
});
