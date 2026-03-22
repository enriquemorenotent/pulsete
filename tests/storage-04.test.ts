import assert from 'node:assert/strict';
import { mkdtempSync,unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { Storage,type NetworkInput } from '../server/storage.js';

const createNetworkInput = (overrides: Partial<NetworkInput> = {}) => ({
  templateId: null,
  managerHidden: false,
  name: 'TestNet',
  host: 'irc.example.test',
  port: 6667,
  tls: false,
  nick: 'tester',
  altNicks: ['tester_', 'tester__'],
  username: 'tester',
  realName: 'Tester Example',
  favorite: false,
  autoJoin: [],
  ...overrides,
});

test('storage rejects changing a template relationship after creation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const template = storage.networks.upsert(createNetworkInput({
    name: 'TemplateNet',
  }));
  const otherTemplate = storage.networks.upsert(createNetworkInput({
    name: 'OtherTemplateNet',
    host: 'irc2.example.test',
    port: 6697,
    tls: true,
  }));
  const clone = storage.networks.upsert(createNetworkInput({
    templateId: template.id,
    managerHidden: true,
    name: 'Connection instance',
  }));

  assert.throws(
    () =>
      storage.networks.upsert({
        ...template,
        templateId: otherTemplate.id,
        managerHidden: true,
      }),
    /Network template relationship cannot be changed after creation/
  );
  assert.throws(
    () =>
      storage.networks.upsert({
        ...clone,
        templateId: null,
        managerHidden: false,
      }),
    /Network template relationship cannot be changed after creation/
  );
  assert.throws(
    () =>
      storage.networks.upsert({
        ...clone,
        templateId: otherTemplate.id,
      }),
    /Network template relationship cannot be changed after creation/
  );
});

test('network passwords stay encrypted at rest, inherit on hidden clones, and can be cleared', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);
  const network = storage.networks.upsert(createNetworkInput({
    name: 'SecretNet',
    port: 6697,
    tls: true,
    password: 'server-secret',
  }));

  const publicProfile = storage.networks.get(network.id);
  assert.equal(publicProfile?.hasPassword, true);
  assert.equal((publicProfile as { password?: string } | null)?.password, undefined);
  assert.equal(storage.networks.getRuntime(network.id)?.password, 'server-secret');

  const db = new DatabaseSync(file);
  const row = db.prepare('SELECT password FROM networks WHERE id = ?').get(network.id) as { password: string };
  db.close();
  assert.notEqual(row.password, 'server-secret');
  assert.match(row.password, /^enc-v1:/);

  const clone = storage.networks.upsert(createNetworkInput({
    templateId: network.id,
    managerHidden: true,
    name: 'SecretNet clone',
    port: 6697,
    tls: true,
  }));
  assert.equal(clone.hasPassword, true);
  assert.equal(storage.networks.getRuntime(clone.id)?.password, 'server-secret');

  storage.networks.upsert({
    ...network,
    password: '',
  });
  assert.equal(storage.networks.getRuntime(network.id)?.password, 'server-secret');

  storage.networks.upsert({
    ...network,
    clearPassword: true,
  });
  assert.equal(storage.networks.get(network.id)?.hasPassword, false);
  assert.equal(storage.networks.getRuntime(network.id)?.password, undefined);
});

test('storage fails fast when encrypted passwords exist but the secret key is missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);
  storage.networks.upsert(createNetworkInput({
    name: 'SecretNet',
    port: 6697,
    tls: true,
    password: 'server-secret',
  }));

  unlinkSync(join(dir, 'pulsete.secret'));

  assert.throws(() => new Storage(file), /Missing network secret key/);
});

test('storage close is idempotent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));

  storage.close();
  storage.close();

  assert.ok(true);
});
