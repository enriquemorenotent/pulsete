import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';
import { createMockSocket,makeUser } from './helpers/irc-race-test-helpers.js';

test('updating a profile while connecting restarts the handshake with the new settings', () => {
  const originalConnect = net.connect;
  const firstWrites: string[] = [];
  const secondWrites: string[] = [];
  const sockets = [createMockSocket(firstWrites), createMockSocket(secondWrites)];
  const statuses: string[] = [];
  let connectCalls = 0;
  net.connect = (() => sockets[connectCalls++]) as unknown as typeof net.connect;

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'OldNet',
      host: 'old.example.test',
      port: 6667,
      tls: false,
      nick: 'oldnick',
      altNicks: ['oldnick_', 'oldnick__'],
      username: 'olduser',
      realName: 'Old User',
      hasPassword: true,
      password: 'oldpass',
      favorite: false,
      autoJoin: [],
    },
    {
      onEvent: (event) => {
        if (event.type === 'status') {
          statuses.push(event.message);
        }
      },
    }
  );

  try {
    connection.connect();
    connection.lifecycle.buffer = ':irc.example 001 oldnick';
    connection.channels.users.set('#help', [makeUser('alice')]);
    connection.updateProfile({
      ...connection.profile,
      name: 'NewNet',
      host: 'new.example.test',
      port: 6697,
      nick: 'newnick',
      altNicks: ['newnick_', 'newnick__'],
      username: 'newuser',
      realName: 'New User',
      hasPassword: true,
      password: 'newpass',
    });

    assert.equal(connectCalls, 2);
    assert.equal(sockets[0].destroyed, true);
    assert.equal(connection.lifecycle.buffer, '');
    assert.equal(connection.channels.users.size, 0);

    sockets[0].emit('lookup', null, '127.0.0.1', 4, 'old.example.test');
    sockets[0].emit('connect');
    assert.deepEqual(firstWrites, []);

    sockets[1].emit('lookup', null, '127.0.0.1', 4, 'new.example.test');
    sockets[1].emit('connect');

    assert.deepEqual(secondWrites, [
      'PASS newpass\r\n',
      'CAP LS 302\r\n',
      'NICK newnick\r\n',
      'USER newuser 0 * :New User\r\n',
    ]);
    assert.ok(statuses.includes('Looking up old.example.test'));
    assert.ok(statuses.includes('Looking up new.example.test'));
    assert.ok(statuses.includes('Connecting to new.example.test (127.0.0.1:6697)'));
  } finally {
    net.connect = originalConnect;
  }
});

