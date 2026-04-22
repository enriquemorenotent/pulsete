import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAssistantActionResolverInput,
  parseAssistantResolvedActionText,
  shouldResolveAssistantAction,
} from '../server/assistant-actions.js';
import type { AssistantTurn } from '../shared/protocol.js';

const buildTurn = (userText: string, assistantText: string): AssistantTurn => ({
  id: `turn:${userText}`,
  status: 'completed',
  error: null,
  items: [
    { type: 'userMessage', id: `user:${userText}`, text: userText, attachments: [] },
    { type: 'agentMessage', id: `assistant:${userText}`, text: assistantText, phase: null, artifact: null },
  ],
  activeBuffer: null,
  resolvedSubject: null,
  routing: null,
});

test('shouldResolveAssistantAction gates persona prompts and follow-up references', () => {
  assert.equal(
    shouldResolveAssistantAction({ prompt: 'Update my persona: I have a Domme called MissD' }),
    true,
  );
  assert.equal(
    shouldResolveAssistantAction({
      prompt: 'So, add them now',
      priorTurns: [
        buildTurn(
          'Show me the corrected persona note',
          'The corrected persona note should be:\nI have a Domme called MissD',
        ),
      ],
    }),
    true,
  );
  assert.equal(
    shouldResolveAssistantAction({ prompt: 'What do you think about mariebella?' }),
    false,
  );
});

test('parseAssistantResolvedActionText parses structured resolver output', () => {
  assert.deepEqual(
    parseAssistantResolvedActionText(JSON.stringify({ kind: 'persona.append', note: 'Married since 2019' })),
    { kind: 'persona.append', note: 'Married since 2019' },
  );
  assert.deepEqual(
    parseAssistantResolvedActionText(JSON.stringify({ kind: 'clarify', message: 'Tell me exactly what to change.' })),
    { kind: 'clarify', message: 'Tell me exactly what to change.' },
  );
  assert.deepEqual(
    parseAssistantResolvedActionText(JSON.stringify({ kind: 'none' })),
    { kind: 'none' },
  );
});

test('buildAssistantActionResolverInput includes the available action surface and thread context', () => {
  const input = buildAssistantActionResolverInput({
    context: {
      networkId: 'network-1',
      networkName: 'Cuff-Link',
      personaNote: '44 yo Spanish woman',
    },
    priorTranscript: 'User: Show me the corrected persona note',
    prompt: 'So, add them now',
  });
  assert.match(input, /Available actions:/);
  assert.match(input, /persona\.append/);
  assert.match(input, /Selected network: Cuff-Link/);
  assert.match(input, /Recent assistant thread transcript:/);
});
