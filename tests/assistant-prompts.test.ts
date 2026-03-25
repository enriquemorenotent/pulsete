import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assistantBaseInstructions,
  buildAssistantTurnInput,
  extractAssistantUserPrompt,
} from '../server/assistant-prompts.js';
import type { AssistantActiveBuffer, BufferState, NetworkProfile } from '../shared/protocol.js';

const network: NetworkProfile = {
  id: 'network-1',
  templateId: null,
  managerHidden: true,
  name: 'TestNet',
  host: 'irc.example.test',
  port: 6667,
  tls: false,
  nick: 'tester',
  altNicks: ['tester_'],
  username: 'tester',
  realName: 'Tester',
  hasPassword: false,
  favorite: false,
  autoJoin: [],
};

const buffer: BufferState = {
  id: 'buffer-1',
  networkId: network.id,
  kind: 'query',
  target: 'alice',
  unread: 0,
};

const activeBuffer: AssistantActiveBuffer = {
  bufferId: buffer.id,
  networkId: network.id,
  target: buffer.target,
  title: 'alice',
};

const context = 'History coverage: full buffer history\n\nFull transcript:\n[2026-03-23 18:00] alice: Hello there';

test('extractAssistantUserPrompt keeps only the typed request from the assistant envelope', () => {
  const prompt = 'Reply briefly and mention the last thing Alice said.';
  const input = buildAssistantTurnInput({
    activeBuffer,
    askInstruction: 'Respond normally.',
    buffer,
    context,
    network,
    prompt,
    retrievedContext: 'Retrieved transcript context for alice:\n[2026-03-23 18:00] alice: Hello there',
    scope: 'buffer',
    task: 'ask',
  });

  assert.equal(extractAssistantUserPrompt(input), prompt);
});

test('extractAssistantUserPrompt falls back to raw text when no envelope marker exists', () => {
  assert.equal(extractAssistantUserPrompt('Plain user text'), 'Plain user text');
});

test('ask prompt envelopes include selected-buffer metadata without implying transcript access', () => {
  const input = buildAssistantTurnInput({
    activeBuffer,
    askInstruction: 'Respond normally.',
    buffer,
    context,
    network,
    prompt: 'hi',
    retrievedContext: '',
    scope: 'free',
    task: 'ask',
  });

  assert.match(input, /Conversation mode: assistant chat with optional transcript lookup/);
  assert.match(input, /Selected buffer metadata:/);
  assert.match(input, /Transcript speaker note:/);
  assert.match(input, /Lines prefixed with "you \(nick\)" were authored by the local user/);
  assert.match(input, /Retrieved transcript context:\n\(none loaded for this turn\)/);
});

test('assistant base instructions require readable list formatting in chat replies', () => {
  assert.match(assistantBaseInstructions, /plain-text chat panel/);
  assert.match(assistantBaseInstructions, /brief lead sentence followed by bullets/);
  assert.match(assistantBaseInstructions, /avoid wall-of-text replies/);
  assert.match(assistantBaseInstructions, /"Answer:" on its own line/);
  assert.match(assistantBaseInstructions, /Do not compress multiple bullet points/);
});

test('ask prompt envelopes require sectioned transcript answers when evidence is loaded', () => {
  const input = buildAssistantTurnInput({
    activeBuffer,
    askInstruction: 'Search the transcript carefully.',
    buffer,
    context,
    network,
    prompt: 'What happened?',
    retrievedContext: 'Retrieved transcript context:\n[2026-03-23 18:00] alice: Hello there',
    scope: 'free',
    task: 'ask',
  });

  assert.match(input, /format factual transcript answers with short labeled sections/);
  assert.match(input, /"Answer:", then "Evidence:" with 1 to 3 "-" bullets/);
  assert.match(input, /instead of chaining several quotes into one paragraph/);
});
