import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { channelListEntryLimit } from '../shared/channel-list.js';
import { IrcConnection } from '../server/irc.js';

test('irc channel list retains a capped snapshot while counting all server entries', () => {
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

  connection.requestChannelList('request-1');
  connection.consume(':irc.example 321 tester Channel :Users Name\r\n');
  for (let index = 1; index <= channelListEntryLimit + 5; index += 1) {
    connection.consume(`:irc.example 322 tester #chan${index} ${index} :Topic ${index}\r\n`);
  }
  connection.consume(':irc.example 323 tester :End of /LIST\r\n');

  const entryEvents = events.filter((event) => event.type === 'channel-list-entry');
  const completed = events.find((event) => event.type === 'channel-list-completed');

  assert.deepEqual(writes, ['LIST\r\n']);
  assert.equal(entryEvents.length, channelListEntryLimit);
  assert.deepEqual(entryEvents.at(-1)?.entry, {
    name: `#chan${channelListEntryLimit}`,
    users: channelListEntryLimit,
    topic: `Topic ${channelListEntryLimit}`,
  });
  assert.deepEqual(completed, {
    type: 'channel-list-completed',
    networkId: connection.profile.id,
    requestId: 'request-1',
    totalEntries: channelListEntryLimit + 5,
    truncated: true,
  });
});
