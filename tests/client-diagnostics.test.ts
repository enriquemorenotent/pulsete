import assert from 'node:assert/strict';
import test from 'node:test';
import { initialState } from '../web/src/app-state.js';
import {
  classifyPerformanceMeasureName,
  createPerformanceMeasureAccumulator,
} from '../web/src/client-diagnostics-browser.js';
import {
  createBoundedDiagnosticsHistory,
  createClientDiagnosticsRecorder,
} from '../web/src/client-diagnostics.js';
import { makeBuffer, makeMessage, makeNetwork, makeState } from './helpers/app-state-test-helpers.js';

test('bounded diagnostics history retains the newest samples in order', () => {
  const history = createBoundedDiagnosticsHistory<number>(2);

  history.push(1);
  history.push(2);
  history.push(3);

  assert.deepEqual(history.values(), [2, 3]);
  assert.equal(history.capacity, 2);
  assert.equal(history.size, 2);
  assert.equal(history.dropped, 1);
});

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

test('diagnostics retain React measure totals without retaining their performance entries', async () => {
  const componentMeasure = '\u200bDiagnosticsRetentionTestComponent';
  const schedulerMeasure = 'Update';
  const unrelatedMeasure = 'pulsete-unrelated-measure-test';
  const measureNames = [componentMeasure, schedulerMeasure, unrelatedMeasure];
  for (const name of measureNames) {
    performance.clearMeasures(name);
  }
  const recorder = createClientDiagnosticsRecorder();
  const stop = recorder.start(() => initialState);

  try {
    performance.measure(componentMeasure, { start: 0, duration: 4 });
    performance.measure(schedulerMeasure, { start: 0, duration: 3 });
    performance.measure(unrelatedMeasure, { start: 0, duration: 2 });

    for (let attempts = 0; attempts < 20; attempts += 1) {
      if (performance.getEntriesByName(componentMeasure, 'measure').length === 0
        && performance.getEntriesByName(schedulerMeasure, 'measure').length === 0) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    assert.equal(performance.getEntriesByName(componentMeasure, 'measure').length, 0);
    assert.equal(performance.getEntriesByName(schedulerMeasure, 'measure').length, 0);
    assert.equal(performance.getEntriesByName(unrelatedMeasure, 'measure').length, 1);

    const report = await recorder.capture(initialState);
    const measures = report.activity.performanceMeasuresObserved;
    assert.ok(measures.count >= 3);
    assert.ok(measures.topByCount.some(
      (entry) => entry.name === 'React component: DiagnosticsRetentionTestComponent',
    ));
    assert.ok(measures.topByCount.some((entry) => entry.name === 'React: Update'));
    assert.ok(measures.topByCount.some(
      (entry) => entry.name === 'Other application/browser measures',
    ));
  } finally {
    stop();
    for (const name of measureNames) {
      performance.clearMeasures(name);
    }
  }
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
  const recorder = createClientDiagnosticsRecorder({ now: () => 1_700_000_000_000 });
  recorder.recordStoreDispatch('append-message', true);
  recorder.recordStoreListenerCount(7);
  recorder.socketInstrumentation.onCreate?.();
  recorder.socketInstrumentation.onReceive?.('message.append', 123);
  recorder.socketInstrumentation.onSend?.('message.send', 45);

  const report = await recorder.capture(state);
  const serialized = JSON.stringify(report);

  for (const secret of Object.values(secrets)) {
    assert.doesNotMatch(serialized, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.equal(report.workspace.messages.count, 1);
  assert.equal(report.workspace.messages.bodyCharacters, secrets.body.length);
  assert.equal(report.workspace.channels.totalUsers, 1);
  assert.equal(report.activity.store.dispatched, 1);
  assert.equal(report.activity.store.activeListeners, 7);
  assert.equal(report.activity.socket.activeConnections, 1);
  assert.equal(report.activity.socket.received[0]?.type, 'message.append');
  assert.equal(report.activity.socket.sent[0]?.type, 'message.send');
  assert.equal(report.privacy.includesChatBodies, false);
});
