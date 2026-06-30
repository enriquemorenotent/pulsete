import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createOpenAiAssistantProvider,
  extractOpenAiText,
} from '../server/openai-assistant-provider.js';

test('OpenAI assistant provider reports unavailable without an API key', () => {
  const provider = createOpenAiAssistantProvider({ OPENAI_API_KEY: '', OPENAI_MODEL: 'gpt-test' });
  assert.equal(provider.provider, 'unavailable');
  assert.equal(provider.model, 'gpt-test');
});

test('OpenAI response text extractor reads direct output text', () => {
  assert.equal(extractOpenAiText({ output_text: ' hello ' }), 'hello');
});

test('OpenAI response text extractor reads output content arrays', () => {
  assert.equal(
    extractOpenAiText({
      output: [
        { content: [{ text: 'first' }] },
        { content: [{ text: 'second' }] },
      ],
    }),
    'first\nsecond',
  );
});
