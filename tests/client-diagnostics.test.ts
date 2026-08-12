import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyPerformanceMeasureName,
  createPerformanceMeasureAccumulator,
} from '../web/src/client-diagnostics-browser.js';
import { captureClientDiagnostics } from '../web/src/client-diagnostics.js';
import { makeBuffer, makeMessage, makeNetwork, makeState } from './helpers/app-state-test-helpers.js';

test('performance summaries preserve React component names but redact arbitrary measure names', () => {
  const accumulator = createPerformanceMeasureAccumulator();
  accumulator.record({ name: '\u200bChatTranscript', duration: 4.25 });
  accumulator.record({ name: 'private room name', duration: 2 });
  accumulator.record({ name: 'Update', duration: 1 });

  const snapshot = accumulator.snapshot();
  const serialized = JSON.stringify(snapshot);

  assert.equal(classifyPerformanceMeasureName('\u200bChatTranscript'), 'React component: ChatTranscript');
  assert.equal(snapshot.count, 3);
  assert.match(serialized, /React component: ChatTranscript/);
  assert.match(serialized, /Other application\/browser measures/);
  assert.doesNotMatch(serialized, /private room name/);
});

test('diagnostics report contains structural memory evidence without conversation data', async () => {
  const secrets = {
    body: 'SECRET_CHAT_BODY_9ca031',
    channel: '#SECRET_CHANNEL_47f4',
    host: 'secret-server.invalid',
    id: 'SECRET_IDENTIFIER_881b',
    nick: 'SECRET_NICK_e10d',
    topic: 'SECRET_TOPIC_77a2',
  };
  const buffer = makeBuffer({
    id: secrets.id,
    kind: 'channel',
    target: secrets.channel,
  });
  const message = makeMessage({
    id: `${secrets.id}-message`,
    bufferId: buffer.id,
    target: secrets.channel,
    nick: secrets.nick,
    body: secrets.body,
  });
  const network = {
    ...makeNetwork(),
    id: `${secrets.id}-network`,
    host: secrets.host,
    name: secrets.host,
    nick: secrets.nick,
    notes: secrets.topic,
  };
  const state = makeState({
    domain: {
      phase: 'ready',
      gatewayStatus: 'connected',
      networks: [network],
      buffers: [buffer],
      messages: { [buffer.id]: [message] },
      channels: [{
        id: `${secrets.id}-channel`,
        networkId: network.id,
        name: secrets.channel,
        topic: secrets.topic,
        users: [{ nick: secrets.nick, mode: 'normal', modes: [], away: false }],
      }],
      friends: [{ id: `${secrets.id}-friend`, nick: secrets.nick }],
      networkStates: {
        [network.id]: {
          phase: 'connected',
          serverName: secrets.host,
          nick: secrets.nick,
          capabilities: { offered: [], negotiated: [], pending: [] },
        },
      },
    },
    transient: {
      selection: { kind: 'buffer', bufferId: buffer.id },
      banner: { kind: 'error', message: secrets.topic },
    },
  });
  const report = await captureClientDiagnostics(state, { now: () => 1_700_000_000_000 });
  const serialized = JSON.stringify(report);

  for (const secret of Object.values(secrets)) {
    assert.doesNotMatch(serialized, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.equal(report.workspace.messages.count, 1);
  assert.equal(report.workspace.messages.bodyCharacters, secrets.body.length);
  assert.equal(report.workspace.channels.totalUsers, 1);
  assert.equal(report.privacy.includesChatBodies, false);
});
