import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';
import { waitFor } from './helpers/async-test-helpers.js';

test('irc connection routes labeled WHOIS replies to the matching buffer even when they arrive out of order', () => {
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
  connection.lifecycle.capabilities.negotiated.add('labeled-response');

  connection.sendClientRaw('WHOIS alice', '#first');
  connection.sendClientRaw('WHOIS alice', '#second');

  assert.deepEqual(writes, ['@label=lr1 WHOIS alice\r\n', '@label=lr2 WHOIS alice\r\n']);

  connection.consume('@label=lr2 :irc.example 311 tester alice user host-two * :Second Reply\r\n');
  connection.consume('@label=lr2 :irc.example 318 tester alice :End of /WHOIS list.\r\n');
  connection.consume('@label=lr1 :irc.example 311 tester alice user host-one * :First Reply\r\n');
  connection.consume('@label=lr1 :irc.example 318 tester alice :End of /WHOIS list.\r\n');

  assert.ok(
    events.some(
        (event) =>
        event.type === 'status'
        && event.target === '#second'
        && event.kind === 'system'
        && event.message === '* alice is user at host-two (Second Reply)'
    )
  );
  assert.ok(
    events.some(
        (event) =>
        event.type === 'status'
        && event.target === '#first'
        && event.kind === 'system'
        && event.message === '* alice is user at host-one (First Reply)'
    )
  );
});
