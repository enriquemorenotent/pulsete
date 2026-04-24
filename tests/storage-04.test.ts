import assert from 'node:assert/strict';
import { mkdtempSync,unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openSqliteDatabase } from '../server/storage-sqlite.js';
import { Storage,type NetworkInput } from '../server/storage.js';

const createNetworkInput = (overrides: Partial<NetworkInput> = {}) => ({
  workspaceOpen: false,
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

test('storage can toggle workspace state after creation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput({
    name: 'TemplateNet',
  }));

  const opened = storage.networks.upsert({ ...network, workspaceOpen: true });
  const closed = storage.networks.upsert({ ...opened, workspaceOpen: false });

  assert.equal(opened.workspaceOpen, true);
  assert.equal(closed.workspaceOpen, false);
});

test('network passwords stay encrypted at rest and can be cleared', () => {
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
