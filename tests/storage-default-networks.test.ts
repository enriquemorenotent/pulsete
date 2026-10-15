import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Storage } from '../server/storage.js';

const withDatabase = (run: (path: string) => void) => {
  const directory = mkdtempSync(join(tmpdir(), 'pulsete-default-networks-'));
  try {
    run(join(directory, 'pulsete.sqlite'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

test('first app startup supplies disconnected TLS networks without channels or credentials', () => {
  withDatabase((path) => {
    const storage = new Storage(path, { seedDefaultNetworks: true });
    try {
      const snapshot = storage.snapshot();
      assert.deepEqual(snapshot.networks.map(({ name, host }) => ({ name, host })), [
        { name: 'Libera.Chat', host: 'irc.libera.chat' },
        { name: 'OFTC', host: 'irc.oftc.net' },
      ]);
      for (const network of snapshot.networks) {
        assert.equal(network.port, 6697);
        assert.equal(network.tls, true);
        assert.equal(network.workspaceOpen, false);
        assert.equal(network.hasPassword, false);
        assert.equal(network.authMethod, 'none');
        assert.match(network.nick, /^guest[0-9a-f]{4}$/);
        assert.deepEqual(network.autoJoin, []);
      }
      assert.deepEqual(snapshot.buffers, []);
      assert.deepEqual(snapshot.messages, []);
    } finally {
      storage.close();
    }
  });
});

test('defaults populate an empty pre-existing installation only once and respect deletion', () => {
  withDatabase((path) => {
    new Storage(path).close();
    let storage = new Storage(path, { seedDefaultNetworks: true });
    const ids = storage.networks.list().map(({ id }) => id);
    storage.close();
    storage = new Storage(path, { seedDefaultNetworks: true });
    assert.deepEqual(storage.networks.list().map(({ id }) => id), ids);
    for (const id of ids) storage.networks.delete(id);
    storage.close();
    storage = new Storage(path, { seedDefaultNetworks: true });
    try {
      assert.deepEqual(storage.networks.list(), []);
    } finally {
      storage.close();
    }
  });
});

test('existing user networks are preserved and never mixed with defaults', () => {
  withDatabase((path) => {
    let storage = new Storage(path);
    const network = storage.networks.upsert({
      name: 'Personal network', host: 'irc.example.test', port: 6697,
      tls: true, nick: 'myname', altNicks: [], realName: '',
      favorite: true, autoJoin: ['#mine'], notes: 'Keep my settings',
    });
    storage.close();
    storage = new Storage(path, { seedDefaultNetworks: true });
    assert.deepEqual(storage.networks.list(), [network]);
    storage.networks.delete(network.id);
    storage.close();
    storage = new Storage(path, { seedDefaultNetworks: true });
    try {
      assert.deepEqual(storage.networks.list(), []);
    } finally {
      storage.close();
    }
  });
});
