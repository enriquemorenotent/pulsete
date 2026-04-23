import assert from 'node:assert/strict';
import { mkdtempSync,unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openSqliteDatabase } from '../server/storage-sqlite.js';
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
    authMethod: 'nickserv',
    authTarget: 'AuthServ',
    authAccount: 'sofia-account',
    password: 'server-secret',
  }));

  const publicProfile = storage.networks.get(network.id);
  assert.equal(publicProfile?.hasPassword, true);
  assert.equal((publicProfile as { password?: string } | null)?.password, undefined);
  assert.equal(storage.networks.getRuntime(network.id)?.password, 'server-secret');

  const db = openSqliteDatabase(file);
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
  assert.equal(clone.authMethod, 'nickserv');
  assert.equal(clone.authTarget, 'AuthServ');
  assert.equal(clone.authAccount, 'sofia-account');
  assert.equal(storage.networks.getRuntime(clone.id)?.password, 'server-secret');

  storage.networks.upsert({
    ...network,
    password: '',
  });
  assert.equal(storage.networks.getRuntime(network.id)?.password, 'server-secret');

  storage.networks.upsert({
    ...network,
    authMethod: 'none',
    clearPassword: true,
  });
  assert.equal(storage.networks.get(network.id)?.hasPassword, false);
  assert.equal(storage.networks.getRuntime(network.id)?.password, undefined);
});

test('password-only updates infer server-pass when authMethod is omitted and preserve whitespace', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);
  const network = storage.networks.upsert(createNetworkInput());
  const password = ' server-secret ';

  const updated = storage.networks.upsert(createNetworkInput({
    id: network.id,
    password,
  }));

  assert.equal(updated.authMethod, 'server-pass');
  assert.equal(updated.hasPassword, true);
  assert.equal(storage.networks.getRuntime(network.id)?.password, password);
});

test('storage validates passwords by auth method', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);
  const saslPassword = ' secret pass ';

  const saslNetwork = storage.networks.upsert(createNetworkInput({
    authMethod: 'sasl-plain',
    authAccount: 'account',
    password: saslPassword,
  }));

  assert.equal(storage.networks.getRuntime(saslNetwork.id)?.password, saslPassword);
  assert.throws(
    () => storage.networks.upsert(createNetworkInput({
      name: 'NickServNet',
      authMethod: 'nickserv',
      authTarget: 'NickServ',
      password: 'secret code',
    })),
    /NickServ passwords cannot contain whitespace/
  );
  assert.throws(
    () => storage.networks.upsert(createNetworkInput({
      name: 'MultilineNet',
      password: 'secret\r\ncode',
    })),
    /Password cannot contain carriage returns or line feeds/
  );
});

test('storage rejects auth methods that do not have a saved password', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);

  assert.throws(
    () => storage.networks.upsert(createNetworkInput({
      authMethod: 'sasl-plain',
      authAccount: 'account',
    })),
    /Selected authentication method requires a saved password/
  );

  const network = storage.networks.upsert(createNetworkInput({
    authMethod: 'nickserv',
    authTarget: 'NickServ',
    password: 'server-secret',
  }));

  assert.throws(
    () => storage.networks.upsert(createNetworkInput({
      id: network.id,
      authMethod: 'nickserv',
      authTarget: 'NickServ',
      clearPassword: true,
    })),
    /Selected authentication method requires a saved password/
  );
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
