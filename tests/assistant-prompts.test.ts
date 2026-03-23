import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAssistantTurnInput, extractAssistantUserPrompt } from '../server/assistant-prompts.js';
import type { BufferState, NetworkProfile } from '../shared/protocol.js';

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

const context = 'History coverage: full buffer history\n\nFull transcript:\n[2026-03-23 18:00] alice: Hello there';

test('extractAssistantUserPrompt keeps only the typed request from the assistant envelope', () => {
  const prompt = 'Reply briefly and mention the last thing Alice said.';
  const input = buildAssistantTurnInput({
    buffer,
    context,
    network,
    prompt,
    task: 'ask',
  });

  assert.equal(extractAssistantUserPrompt(input), prompt);
});

test('extractAssistantUserPrompt falls back to raw text when no envelope marker exists', () => {
  assert.equal(extractAssistantUserPrompt('Plain user text'), 'Plain user text');
});
