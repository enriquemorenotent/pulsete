import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';

test('irc connection surfaces raw NAMES payloads for unjoined channels', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const writes: string[] = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: 'irc.example.test',
      port: 6667,
      tls: false,
      nick: 'tester',
      altNicks: ['tester_', 'tester__'],
      username: 'tester',
      realName: 'Test User',
      hasPassword: false,
      favorite: false,
      autoJoin: [],
    },
    {
      onEvent: (event) => {
        events.push(event);
      },
    }
  );

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.sendClientRaw('NAMES #help', '#chat');
  connection.consume(':irc.example 353 tester = #help :@alice bob\r\n');
  connection.consume(':irc.example 366 tester #help :End of /NAMES list.\r\n');

  assert.deepEqual(writes, ['NAMES #help\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === 'server'
        && event.kind === 'system'
        && event.message === '* #help @alice bob'
    )
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === 'server'
        && event.kind === 'system'
        && event.message === '* #help End of /NAMES list.'
    )
  );
});

test('irc connection surfaces raw TOPIC payloads for unjoined channels', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const writes: string[] = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: 'irc.example.test',
      port: 6667,
      tls: false,
      nick: 'tester',
      altNicks: ['tester_', 'tester__'],
      username: 'tester',
      realName: 'Test User',
      hasPassword: false,
      favorite: false,
      autoJoin: [],
    },
    {
      onEvent: (event) => {
        events.push(event);
      },
    }
  );

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.sendClientRaw('TOPIC #help', '#chat');
  connection.consume(':irc.example 332 tester #help :Current topic\r\n');
  connection.consume(':irc.example 333 tester #help alice 123\r\n');

  assert.deepEqual(writes, ['TOPIC #help\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === 'server'
        && event.kind === 'system'
        && event.message === '* #help Current topic'
    )
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === undefined
        && event.kind === 'system'
        && event.message === '* #help alice 123'
    )
  );
});

test('irc connection routes rejected joins through the pending session target', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const writes: string[] = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: 'irc.example.test',
      port: 6667,
      tls: false,
      nick: 'tester',
      altNicks: ['tester_', 'tester__'],
      username: 'tester',
      realName: 'Test User',
      hasPassword: false,
      favorite: false,
      autoJoin: [],
    },
    {
      onEvent: (event) => {
        events.push(event);
      },
    }
  );

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.join('#missing', '#chat', { visiblePending: true });
  connection.consume(':irc.example 403 tester #missing :No such channel\r\n');

  assert.deepEqual(writes, ['JOIN #missing\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#chat'
        && String(event.message).includes('No such channel')
    )
  );
});

test('irc connection routes 437 rejected joins through the pending session target', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const writes: string[] = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: 'irc.example.test',
      port: 6667,
      tls: false,
      nick: 'tester',
      altNicks: ['tester_', 'tester__'],
      username: 'tester',
      realName: 'Test User',
      hasPassword: false,
      favorite: false,
      autoJoin: [],
    },
    {
      onEvent: (event) => {
        events.push(event);
      },
    }
  );

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.join('#missing', '#chat', { visiblePending: true });
  connection.consume(':irc.example 437 tester #missing :Channel is temporarily unavailable\r\n');

  assert.deepEqual(writes, ['JOIN #missing\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#chat'
        && String(event.message).includes('Channel is temporarily unavailable')
    )
  );
});

test('irc connection refreshes away status from WHO after joining a tracked channel', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const writes: string[] = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: 'irc.example.test',
      port: 6667,
      tls: false,
      nick: 'tester',
      altNicks: ['tester_', 'tester__'],
      username: 'tester',
      realName: 'Test User',
      hasPassword: false,
      favorite: false,
      autoJoin: [],
    },
    {
      onEvent: (event) => {
        events.push(event);
      },
    }
  );

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.join('#help');
  connection.consume(':tester!user@example JOIN :#help\r\n');
  connection.consume(':irc.example 353 tester = #help :tester alice\r\n');
  connection.consume(':irc.example 366 tester #help :End of /NAMES list.\r\n');
  connection.consume(':irc.example 352 tester #help user host irc.example alice G :0 Alice Example\r\n');

  assert.deepEqual(writes, ['JOIN #help\r\n', 'WHO #help\r\n']);
  assert.deepEqual(
    (events.filter((event) => event.type === 'channel').at(-1)?.users as Array<Record<string, unknown>> | undefined)
      ?.map((user) => ({ nick: user.nick, away: user.away })),
    [
      { nick: 'alice', away: true },
      { nick: 'tester', away: false },
    ],
  );
});

test('irc connection updates channel roster details from modern server events without a WHO fallback', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const writes: string[] = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: 'irc.example.test',
      port: 6667,
      tls: false,
      nick: 'tester',
      altNicks: ['tester_', 'tester__'],
      username: 'tester',
      realName: 'Test User',
      hasPassword: false,
      favorite: false,
      autoJoin: [],
    },
    {
      onEvent: (event) => {
        events.push(event);
      },
    }
  );

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;
  connection.lifecycle.capabilities.negotiated.add('away-notify');

  connection.join('#help');
  connection.consume(':tester!me@example JOIN #help tester :Test User\r\n');
  connection.consume(':irc.example 353 tester = #help :tester!me@example @alice!user@host\r\n');
  connection.consume(':irc.example 366 tester #help :End of /NAMES list.\r\n');
  connection.consume(':bob!buser@bhost JOIN #help bobacc :Bob Example\r\n');
  connection.consume(':alice!user@host ACCOUNT aliceacc\r\n');
  connection.consume(':alice!user@host AWAY :Out for lunch\r\n');
  connection.consume(':alice!user@host CHGHOST newuser new.host\r\n');
  connection.consume(':alice!user@host SETNAME :Alice Renamed\r\n');

  assert.deepEqual(writes, ['JOIN #help\r\n']);

  const latestUsers = (events.filter((event) => event.type === 'channel').at(-1)?.users as Array<Record<string, unknown>> | undefined)
    ?.map((user) => ({
      nick: user.nick,
      away: user.away,
      account: user.account,
      username: user.username,
      host: user.host,
      realname: user.realname,
    }));

  assert.deepEqual(latestUsers, [
    {
      nick: 'alice',
      away: true,
      account: 'aliceacc',
      username: 'newuser',
      host: 'new.host',
      realname: 'Alice Renamed',
    },
    {
      nick: 'bob',
      away: false,
      account: 'bobacc',
      username: 'buser',
      host: 'bhost',
      realname: 'Bob Example',
    },
    {
      nick: 'tester',
      away: false,
      account: 'tester',
      username: 'me',
      host: 'example',
      realname: 'Test User',
    },
  ]);
});
