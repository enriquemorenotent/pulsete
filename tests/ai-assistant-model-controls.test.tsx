import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AiAssistantProviderStatus } from '../shared/protocol-ai.js';
import { AiAssistantModelControls } from '../web/src/AiAssistantModelControls.js';

const status: AiAssistantProviderStatus = {
  availableModels: [{
    defaultReasoningEffort: 'medium',
    id: 'gpt-5.6-terra',
    label: 'GPT-5.6-Terra',
    reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
  }],
  connected: true,
  detail: 'connected',
  model: 'gpt-5.6-terra',
  modelsError: null,
  provider: 'codex-openai-login',
  reasoningEffort: 'medium',
  selectionNotice: null,
};

test('assistant model controls show the active model and reasoning effort', () => {
  const markup = renderToStaticMarkup(
    <AiAssistantModelControls
      disabled={false}
      onSelectionChange={() => undefined}
      savedSelection={{ model: 'gpt-5.6-terra', reasoningEffort: 'high' }}
      status={status}
    />,
  );

  assert.match(markup, /aria-label="Assistant model settings"/);
  assert.match(markup, />Model</);
  assert.match(markup, />Reasoning</);
  assert.match(markup, />Terra</);
  assert.match(markup, />High</);
});
