import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createRuntime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import { createNetworkInput, waitFor } from './helpers/runtime-test-common.js';

test('runtime auto-loads recent server history after joining a chathistory-capable channel', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-chathistory-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage);
  const received: string[] = [];
  const server = await createChatHistoryServer(received);
  const network = storage.networks.upsert(createNetworkInput({
    host: '127.0.0.1',
    port: server.port,
    nick: 'tester',
    altNicks: ['tester_', 'tester__'],
    realName: 'Tester Example',
  }));

  try {
    runtime.sessions.connect(network.id);
    await waitFor(() => runtime.gateway.snapshot().networkStates[network.id]?.phase === 'connected');
    await waitFor(() =>
      runtime.gateway.snapshot().networkStates[network.id]?.capabilities?.values?.['isupport/chathistory'] === '3'
    );

    runtime.irc.join(network.id, '#chat');
    await waitFor(() => received.includes('CHATHISTORY LATEST #chat * 3'));
    await waitFor(() => storage.conversations.listAllMessages(network.id, '#chat').some(
      (message) => message.body === 'before you joined',
    ));

    const historyMessage = storage.conversations.getMessageById(`ircv3:${network.id}:history-1`);
    const channelBuffer = storage.conversations.getBufferByTarget(network.id, '#chat');
    assert.equal(historyMessage?.body, 'before you joined');
    assert.equal(historyMessage?.delivery, 'server-history');
    assert.equal(historyMessage?.ts, Date.parse('2026-06-30T12:00:00.000Z'));
    assert.equal(channelBuffer?.unread, 0);
    assert.equal(channelBuffer?.priorityUnread, 0);
  } finally {
    runtime.sessions.disconnect(network.id);
    server.closeConnections();
    await new Promise<void>((resolve, reject) =>
      server.server.close((error) => (error ? reject(error) : resolve())));
  }
});

const createChatHistoryServer = async (received: string[]) => {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    let buffer = '';
    let nick: string | null = null;
    let sawUser = false;
    let capEnded = false;
    let welcomed = false;
    const maybeWelcome = () => {
      if (nick && sawUser && capEnded && !welcomed) {
        welcomed = true;
        socket.write(`:irc.example 001 ${nick} :Welcome\r\n`);
        socket.write(`:irc.example 005 ${nick} CHATHISTORY=3 :are supported by this server\r\n`);
      }
    };
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    socket.on('data', (chunk) => {
      buffer += chunk;
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        received.push(line);
        if (line === 'CAP LS 302') {
          socket.write(':irc.example CAP * LS :batch draft/chathistory message-tags server-time\r\n');
        } else if (line.startsWith('CAP REQ :')) {
          socket.write(`:irc.example CAP * ACK :${line.slice('CAP REQ :'.length)}\r\n`);
        } else if (line === 'CAP END') {
          capEnded = true;
          maybeWelcome();
        } else if (line.startsWith('NICK ')) {
          nick = line.slice('NICK '.length).trim() || nick;
          maybeWelcome();
        } else if (line.startsWith('USER ')) {
          sawUser = true;
          maybeWelcome();
        } else if (line === 'JOIN #chat') {
          socket.write(`:${nick}!user@example JOIN #chat\r\n`);
        } else if (line === 'CHATHISTORY LATEST #chat * 3') {
          socket.write('@draft/chathistory-end :irc.example BATCH +hist chathistory #chat\r\n');
          socket.write('@batch=hist;msgid=history-1;time=2026-06-30T12:00:00.000Z :alice!user@example PRIVMSG #chat :before you joined\r\n');
          socket.write(':irc.example BATCH -hist\r\n');
        }
        index = buffer.indexOf('\n');
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    server,
    port: address.port,
    closeConnections() {
      for (const socket of sockets) {
        socket.destroy();
      }
      sockets.clear();
    },
  };
};
