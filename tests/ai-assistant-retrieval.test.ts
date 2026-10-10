import assert from 'node:assert/strict';
import test from 'node:test';
import { planAiAssistantRetrieval } from '../server/ai-assistant-retrieval.js';
import { readAssistantDateRange } from '../server/ai-assistant-dates.js';
import { normalizeAssistantTurns } from '../shared/ai-assistant-turns.js';
import { aiAssistantRequestSchema } from '../shared/protocol-ai.js';

const plan = (prompt: string) => planAiAssistantRetrieval({ mode: 'answer', prompt, assistantTurns: [] });

test('ordinary replies and follow-ups do not request the entire history', () => {
  assert.equal(plan('What is the best reply?').includeFullLog, false);
  const followUp = planAiAssistantRetrieval({ mode: 'answer', prompt: 'Can you explain this briefly?',
    assistantTurns: [{ role: 'user', text: 'Where is the bridge?' }, { role: 'assistant', text: 'Nearby.' }] });
  assert.equal(followUp.includeFullLog, false);
  assert.equal(followUp.fullLogWhenSearchMisses, false);
  assert.deepEqual(followUp.searchTerms, ['bridge']);
});

test('German questions retain topic words rather than filler words', () => {
  assert.deepEqual(plan('Was haben wir gestern über Deployment besprochen?').searchTerms, ['deployment']);
  assert.equal(plan('Wie oft haben wir uns getroffen?').includeFullLog, true);
});

test('English and German relative dates select local calendar days', () => {
  const now = new Date(2026, 9, 9, 12);
  for (const word of ['yesterday', 'gestern']) {
    assert.deepEqual(readAssistantDateRange(`What did we discuss ${word}?`, now), {
      start: new Date(2026, 9, 8).getTime(), end: new Date(2026, 9, 9).getTime(), label: word,
    });
  }
  assert.equal(plan('What did we discuss yesterday?').includeFullLog, true);
  assert.equal(readAssistantDateRange('vorgestern', now)?.start, new Date(2026, 9, 7).getTime());
});

test('explicit dates validate calendar dates and support German and English notation', () => {
  for (const text of ['June 12 2026', '12. Juni 2026', '2026-06-12', '12.06.2026', '6/12/2026']) {
    assert.equal(readAssistantDateRange(text)?.start, new Date(2026, 5, 12).getTime(), text);
  }
  assert.equal(readAssistantDateRange('2026-02-30'), null);
});

test('long generated answers remain valid in Unicode-heavy follow-up requests', () => {
  const assistantTurns = normalizeAssistantTurns(Array.from({ length: 12 }, (_, index) => ({
    role: index % 2 ? 'assistant' as const : 'user' as const, text: '😀'.repeat(10_000),
  })));
  const request = { mode: 'answer', prompt: '😀'.repeat(2_000), assistantTurns };
  assert.equal(aiAssistantRequestSchema.safeParse(request).success, true);
  assert.ok(Buffer.byteLength(JSON.stringify(request)) < 64 * 1024);
  assert.ok(assistantTurns.every((turn) => turn.text.length <= 1_000));
});
