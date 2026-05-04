import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openSqliteDatabase } from '../server/storage-sqlite.js';
import { Storage } from '../server/storage.js';
import { createNetworkInput } from './helpers/runtime-test-common.js';

type RepairSummary = {
  mode: 'dry-run' | 'apply';
  backupDirectory?: string;
  sourceTarget: string;
  primaryTarget: string;
  artifactMessages: number;
  assignedByTarget: Record<string, number>;
};

test('merged query repair splits aliases, preserves primary notes, and removes split artifacts', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'pulsete-repair-')), 'db.sqlite');
  let storage = new Storage(file);
  const network = storage.networks.upsert(createNetworkInput({ workspaceOpen: true }));
  const dataBuffer = storage.conversations.upsertQuery(network.id, 'Data');
  const source = storage.conversations.upsertQuery(network.id, 'alicia', { kind: 'account', value: 'tester' });
  storage.conversations.appendMessage({
    id: 'existing-data',
    networkId: network.id,
    target: 'Data',
    nick: 'Data',
    senderIdentity: { kind: 'account', value: 'data' },
    body: 'existing data',
    kind: 'notice',
    self: false,
    ts: 1,
  });
  storage.close();

  let db = openSqliteDatabase(file);
  const now = Date.now();
  db.prepare('UPDATE buffers SET notes = ? WHERE id = ?').run('Lez notes', source.id);
  const insertAlias = db.prepare(`
    INSERT INTO query_nick_aliases
      (bufferId, networkId, nick, nickKey, firstSeenAt, lastSeenAt, source)
    VALUES (?, ?, ?, ?, ?, ?, 'target')
    ON CONFLICT(bufferId, nickKey) DO UPDATE SET lastSeenAt = excluded.lastSeenAt
  `);
  insertAlias.run(source.id, network.id, 'Lez-Ali', 'lez-ali', 10_000, 10_000);
  insertAlias.run(source.id, network.id, 'Data', 'data', 1_000, 1_000);
  insertAlias.run(source.id, network.id, 'alicia', 'alicia', 30_000, 30_000);
  insertAlias.run(source.id, network.id, 'DarykTrestman', 'daryktrestman', 40_000, 40_000);
  const insertIdentity = db.prepare(`
    INSERT OR REPLACE INTO query_peer_identities
      (bufferId, networkId, identityKind, identityValue, nick, firstSeenAt, lastSeenAt, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'message')
  `);
  insertIdentity.run(source.id, network.id, 'account', 'tester', 'alicia', now, now);
  insertIdentity.run(source.id, network.id, 'account', 'lez-ali', 'Lez-Ali', now, now);
  insertIdentity.run(source.id, network.id, 'account', 'data', 'Data', now, now);
  insertIdentity.run(source.id, network.id, 'account', 'alicia', 'alicia', now, now);
  insertIdentity.run(source.id, network.id, 'account', 'daryktrestman', 'DarykTrestman', now, now);
  const insertMessage = db.prepare(`
    INSERT INTO messages
      (id, bufferId, nick, senderIdentityKind, senderIdentityValue, speakerRole, speakerNick,
       attributionSource, attributionConfidence, importBatchId, body, kind, self, ts)
    VALUES (?, ?, ?, ?, ?, 'unknown', ?, 'unknown', 'low', NULL, ?, ?, ?, ?)
  `);
  insertMessage.run('self-command', source.id, 'tester', 'account', 'tester', 'tester', '!view Lez-Ali', 'line', 1, 11_000);
  insertMessage.run('data-reply', source.id, 'Data', 'account', 'data', 'Data', 'Profile for Lez-Ali', 'notice', 0, 12_000);
  insertMessage.run('artifact', source.id, null, null, null, null, 'Lez-Ali is now known as alicia', 'system', 0, 15_000);
  insertMessage.run('self-lez', source.id, 'tester', 'account', 'tester', 'tester', 'Hello', 'line', 1, 20_000);
  insertMessage.run('peer-lez', source.id, 'Lez-Ali', 'account', 'lez-ali', 'Lez-Ali', 'Hi', 'line', 0, 21_000);
  insertMessage.run('self-alicia', source.id, 'tester', 'account', 'tester', 'tester', 'Hi alicia', 'line', 1, 30_000);
  insertMessage.run('peer-alicia', source.id, 'alicia', 'account', 'alicia', 'alicia', 'Hello alicia', 'line', 0, 35_000);
  insertMessage.run('self-before-artifact', source.id, 'tester', 'account', 'tester', 'tester', 'Still alicia', 'line', 1, 39_000);
  insertMessage.run('artifact-daryk', source.id, null, null, null, null, 'alicia is now known as DarykTrestman', 'system', 0, 40_000);
  insertMessage.run('peer-daryk', source.id, 'DarykTrestman', 'account', 'daryktrestman', 'DarykTrestman', 'Daryk reply', 'line', 0, 40_001);
  db.close();

  const script = join(process.cwd(), 'scripts/repair_merged_queries.mjs');
  const baseArgs = [script, '--database', file, '--buffer', source.id, '--primary-target', 'Lez-Ali'];
  const dryRun = JSON.parse(execFileSync(process.execPath, baseArgs).toString()) as RepairSummary;

  assert.equal(dryRun.mode, 'dry-run');
  assert.equal(dryRun.sourceTarget, 'alicia');
  assert.equal(dryRun.primaryTarget, 'Lez-Ali');
  assert.equal(dryRun.artifactMessages, 2);
  assert.equal(dryRun.assignedByTarget.Data, 2);

  db = openSqliteDatabase(file);
  assert.equal((db.prepare('SELECT target FROM buffers WHERE id = ?').get(source.id) as { target: string }).target, 'alicia');
  db.close();

  const applied = JSON.parse(execFileSync(process.execPath, [...baseArgs, '--apply']).toString()) as RepairSummary;
  assert.equal(applied.mode, 'apply');
  assert.ok(applied.backupDirectory && existsSync(applied.backupDirectory));

  storage = new Storage(file);
  assert.equal(storage.conversations.getBuffer(source.id)?.target, 'Lez-Ali');
  assert.equal(storage.conversations.getBuffer(source.id)?.notes, 'Lez notes');
  assert.deepEqual(
    storage.conversations.listMessages(network.id, 'Data', 10).map((message) => message.body),
    ['existing data', '!view Lez-Ali', 'Profile for Lez-Ali'],
  );
  assert.deepEqual(
    storage.conversations.listMessages(network.id, 'Lez-Ali', 10).map((message) => message.body),
    ['Hello', 'Hi'],
  );
  assert.deepEqual(
    storage.conversations.listMessages(network.id, 'alicia', 10).map((message) => message.body),
    ['Hi alicia', 'Hello alicia', 'Still alicia'],
  );
  assert.deepEqual(
    storage.conversations.listMessages(network.id, 'DarykTrestman', 10).map((message) => message.body),
    ['Daryk reply'],
  );
  assert.equal(storage.conversations.getBuffer(dataBuffer.id)?.target, 'Data');
  assert.equal(storage.conversations.getBuffer(dataBuffer.id)?.peerIdentity?.value, 'data');
  assert.equal(storage.conversations.getBuffer(source.id)?.peerIdentity?.value, 'lez-ali');
  assert.equal(
    storage.conversations
      .listMessages(network.id, 'Lez-Ali', 10)
      .some((message) => message.body.includes('now known as')),
    false,
  );
});
