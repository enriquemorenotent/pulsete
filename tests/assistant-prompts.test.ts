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
  personaNote: '',
};

const buffer: BufferState = {
  id: 'buffer-1',
  networkId: network.id,
  kind: 'query',
  target: 'alice',
  unread: 0,
  priorityUnread: 0,
  lastReadTs: null,
  lastReadMessageId: null,
};

const activeBuffer: AssistantActiveBuffer = {
  bufferId: buffer.id,
  networkId: network.id,
  target: buffer.target,
  title: 'alice',
};

const context = 'History coverage: full buffer history\n\nFull transcript:\n[2026-03-23 18:00] alice: Hello there';

const networkWithPersona: NetworkProfile = {
  ...network,
  personaNote: 'Warm, concise, and a little playful.',
};

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
  assert.match(input, /the local user is labeled as "You:"/);
  assert.match(input, /Retrieved transcript context:\n\(none loaded for this turn\)/);
});

test('ask prompt envelopes include persona guidance for reply-writing and self-profile answers', () => {
  const input = buildAssistantTurnInput({
    activeBuffer,
    askInstruction: 'Help draft a reply.',
    buffer,
    context,
    network: networkWithPersona,
    prompt: 'Help me answer Alice.',
    retrievedContext: '',
    scope: 'free',
    task: 'ask',
  });

  assert.match(input, /Persona note for this network:/);
  assert.match(input, /profile context for how they present themselves/);
  assert.match(input, /answering direct questions about the user's stated persona or profile/);
  assert.match(input, /Warm, concise, and a little playful\./);
});

test('draft prompt envelopes include persona guidance', () => {
  const input = buildAssistantTurnInput({
    buffer,
    context,
    network: networkWithPersona,
    prompt: 'Draft a reply to Alice.',
    scope: 'buffer',
    task: 'draft',
  });

  assert.match(input, /Task: Draft a reply/);
  assert.match(input, /Persona note for this network:/);
  assert.match(input, /Warm, concise, and a little playful\./);
});

test('assistant base instructions require readable list formatting in chat replies', () => {
  assert.match(assistantBaseInstructions, /plain-text chat panel/);
  assert.match(assistantBaseInstructions, /brief lead sentence followed by bullets/);
  assert.match(assistantBaseInstructions, /sound like a person in chat/);
  assert.match(assistantBaseInstructions, /Do not claim you changed saved app state such as persona notes/);
  assert.match(assistantBaseInstructions, /Do not use rigid labels like "Answer:", "Evidence:", or "Limits:"/);
  assert.match(assistantBaseInstructions, /renders transcript evidence separately/);
  assert.match(assistantBaseInstructions, /Do not invent or relabel transcript speakers/);
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

  assert.match(input, /answer from it in natural prose/);
  assert.match(input, /Answer in natural chat prose/);
  assert.match(input, /Do not use rigid headings like "Answer:", "Evidence:", or "Limits:"/);
  assert.match(input, /renders the supporting transcript excerpt separately/);
  assert.match(input, /Do not invent, merge, or relabel speakers/);
  assert.match(input, /prefer direct stated answer lines over thematic inference/);
});
