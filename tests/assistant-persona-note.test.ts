import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyPersonaNoteCommand,
  parseExplicitPersonaNoteCommand,
} from '../server/assistant-persona-note.js';

test('parseExplicitPersonaNoteCommand parses explicit slash commands', () => {
  assert.deepEqual(
    parseExplicitPersonaNoteCommand('/persona set 44 yo Spanish woman'),
    { kind: 'set', note: '44 yo Spanish woman' },
  );
  assert.deepEqual(
    parseExplicitPersonaNoteCommand('/persona append confident and playful'),
    { kind: 'append', note: 'confident and playful' },
  );
  assert.deepEqual(
    parseExplicitPersonaNoteCommand('/persona clear'),
    { kind: 'clear' },
  );
});

test('parseExplicitPersonaNoteCommand keeps natural-language prompts out of the deterministic path', () => {
  assert.equal(
    parseExplicitPersonaNoteCommand('Update my persona: I have a Domme called MissD'),
    null,
  );
  assert.equal(
    parseExplicitPersonaNoteCommand('Rewrite the whole persona in a way that is more readable'),
    null,
  );
});

test('parseExplicitPersonaNoteCommand clarifies incomplete slash commands', () => {
  assert.deepEqual(
    parseExplicitPersonaNoteCommand('/persona set'),
    { kind: 'clarify' },
  );
  assert.deepEqual(
    parseExplicitPersonaNoteCommand('/persona append'),
    { kind: 'clarify' },
  );
});

test('applyPersonaNoteCommand appends on a new line and normalizes line endings', () => {
  assert.equal(
    applyPersonaNoteCommand('44 yo Spanish woman\r\nLiving in Germany', { kind: 'append', note: 'Married' }),
    '44 yo Spanish woman\nLiving in Germany\nMarried',
  );
});
