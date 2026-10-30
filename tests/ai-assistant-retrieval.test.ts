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

test('date ranges and comparisons include every referenced local day', () => {
  const now = new Date(2026, 9, 9, 12);
  for (const prompt of [
    'Summarize 2026-10-01 through 2026-10-07',
    'Compare 2026-10-07 with 2026-10-01',
    'October 1 through October 7',
    'October 1 through 7, 2026',
    'Vom 1. bis 7. Oktober 2026',
    '01.10.2026 bis 07.10.2026',
    '10/1/2026 to 10/7/2026',
  ]) {
    const range = readAssistantDateRange(prompt, now);
    assert.equal(range?.start, new Date(2026, 9, 1).getTime(), prompt);
    assert.equal(range?.end, new Date(2026, 9, 8).getTime(), prompt);
  }
  const relative = readAssistantDateRange('Compare yesterday with today', now);
  assert.equal(relative?.start, new Date(2026, 9, 8).getTime());
  assert.equal(relative?.end, new Date(2026, 9, 10).getTime());
  assert.equal(readAssistantDateRange('2026-02-28 through 2026-02-30', now), null);
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

test('directional dates exclude the named local day and keep the other bound open', () => {
  const now = new Date(2026, 9, 9, 12);
  for (const [date, month, day] of [
    ['2026-10-08', 9, 8], ['8. Oktober 2026', 9, 8], ['October 8, 2026', 9, 8],
    ['08.10.2026', 9, 8], ['10/8/2026', 9, 8], ['yesterday', 9, 8],
    ['gestern', 9, 8], ['today', 9, 9], ['heute', 9, 9], ['vorgestern', 9, 7],
    ['2026-03-29', 2, 29],
  ] as const) {
    for (const direction of ['before', 'vor', 'after', 'nach']) {
      const before = direction === 'before' || direction === 'vor';
      assert.deepEqual(readAssistantDateRange(`Meeting ${direction} ${date}?`, now), {
        start: before ? null : new Date(2026, month, day + 1).getTime(),
        end: before ? new Date(2026, month, day).getTime() : null,
        label: `${direction} ${date}`,
      });
    }
  }
  for (const prompt of ['before 2026-01-03 and after 2026-01-01',
    'before January 1 through 7, 2026', 'before or after 2026-01-01', 'before 2026-02-30']) {
    assert.equal(readAssistantDateRange(prompt, now), null, prompt);
  }
});
