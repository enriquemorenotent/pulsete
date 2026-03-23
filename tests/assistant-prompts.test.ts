import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAssistantTurnInput, extractAssistantUserPrompt } from '../server/assistant-prompts.js';
import type { BufferState, ChatMessage, NetworkProfile } from '../shared/protocol.js';

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

const messages: ChatMessage[] = [{
  id: 'message-1',
  networkId: network.id,
  target: buffer.target,
  nick: 'alice',
  body: 'Hello there',
  kind: 'line',
  self: false,
  ts: Date.parse('2026-03-23T18:00:00Z'),
}];

test('extractAssistantUserPrompt keeps only the typed request from the assistant envelope', () => {
  const prompt = 'Reply briefly and mention the last thing Alice said.';
  const input = buildAssistantTurnInput({
    buffer,
    network,
    messages,
    prompt,
    task: 'ask',
  });

  assert.equal(extractAssistantUserPrompt(input), prompt);
});

test('extractAssistantUserPrompt falls back to raw text when no envelope marker exists', () => {
  assert.equal(extractAssistantUserPrompt('Plain user text'), 'Plain user text');
});
