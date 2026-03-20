import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';

const waitFor = async (predicate: () => boolean, timeoutMs = 3000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timed out waiting for condition');
};

test('irc connection negotiates, joins, and parses messages', async () => {
  const received: string[] = [];
  const events: Array<{ type: string; [key: string]: unknown }> = [];

  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    let sawNick = false;
    let sawUser = false;

    const flush = () => {
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        received.push(line);

        if (line.startsWith('NICK ')) {
          sawNick = true;
        }

        if (line.startsWith('USER ')) {
          sawUser = true;
        }

        if (sawNick && sawUser) {
          socket.write(':irc.example 001 tester :Welcome\r\n');
          socket.write(':irc.example 005 tester CHANTYPES=# NETWORK=TestNet :are supported by this server\r\n');
          socket.write(':irc.example 372 tester :- \u000304hello from motd\u000f\r\n');
          socket.write(':irc.example 376 tester :End of /MOTD command.\r\n');
        }

        if (line.startsWith('JOIN ')) {
          const channel = line.slice(5);
          socket.write(`:tester!user@host JOIN ${channel}\r\n`);
          socket.write(`:irc.example 353 tester = ${channel} :@tester +helper\r\n`);
          socket.write(`:irc.example 332 tester ${channel} :Topic line\r\n`);
        }

        if (line.startsWith('PRIVMSG ')) {
          const target = line.split(' ')[1];
          socket.write(`:other!user@host PRIVMSG ${target} :\u0002reply from server\u000f\r\n`);
        }

        index = buffer.indexOf('\n');
      }
    };

    socket.on('data', (chunk) => {
      buffer += chunk;
      flush();
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: '127.0.0.1',
      port: address.port,
      tls: false,
      nick: 'tester',
      altNicks: ['tester_', 'tester__'],
      username: 'tester',
      realName: 'Test User',
      hasPassword: false,
      favorite: false,
      autoJoin: ['#chat'],
    },
    {
      onEvent: (event) => {
        events.push(event);
      },
    }
  );

  connection.connect();

  await waitFor(() => events.some((event) => event.type === 'state' && event.connected === true));
  await waitFor(() => received.some((line) => line.startsWith('JOIN #chat')));

  connection.say('#chat', 'hello there');

  await waitFor(
    () =>
      events.some(
        (event) =>
          event.type === 'message' &&
          (event as { type: string; message: { body: string; self: boolean } }).message.body === 'hello there' &&
          (event as { type: string; message: { body: string; self: boolean } }).message.self === true
      )
  );

  await waitFor(
    () =>
      events.some(
        (event) =>
          event.type === 'message' &&
          (event as { type: string; message: { body: string } }).message.body === '\u0002reply from server\u000F'
      )
  );

  await waitFor(
    () =>
      events.some(
        (event) =>
          event.type === 'status' &&
          event.kind === 'system' &&
          event.message === '* Welcome'
      ) &&
      events.some(
        (event) =>
          event.type === 'status' &&
          event.kind === 'system' &&
          event.message === '* CHANTYPES=# NETWORK=TestNet are supported by this server'
      ) &&
      events.some(
        (event) =>
          event.type === 'status' &&
          event.kind === 'system' &&
          event.message === '* - \u000304hello from motd\u000F'
      ) &&
      events.some(
        (event) =>
          event.type === 'status' &&
          event.kind === 'system' &&
          event.message === '* End of /MOTD command.'
      )
  );

  connection.disconnect();
  server.close();

  assert.ok(received.some((line) => line.startsWith('NICK tester')));
  assert.ok(received.some((line) => line.startsWith('PRIVMSG #chat :hello there')));
  assert.ok(events.some((event) => event.type === 'channel'));
});

test('irc connection maps direct messages to sender buffer', async () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];

  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    let sawNick = false;
    let sawUser = false;

    const flush = () => {
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);

        if (line.startsWith('NICK ')) {
          sawNick = true;
        }

        if (line.startsWith('USER ')) {
          sawUser = true;
        }

        if (sawNick && sawUser) {
          socket.write(':irc.example 001 tester :Welcome\r\n');
          socket.write(':other!user@host PRIVMSG tester :hello in private\r\n');
          sawNick = false;
          sawUser = false;
        }

        index = buffer.indexOf('\n');
      }
    };

    socket.on('data', (chunk) => {
      buffer += chunk;
      flush();
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: '127.0.0.1',
      port: address.port,
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

  connection.connect();

  await waitFor(
    () =>
      events.some(
        (event) =>
          event.type === 'message' &&
          (event as { type: string; message: { target: string; body: string } }).message.target === 'other' &&
          (event as { type: string; message: { target: string; body: string } }).message.body === 'hello in private'
      )
  );

  connection.disconnect();
  server.close();
});

test('irc connection sends direct private messages to nick targets', async () => {
  const received: string[] = [];

  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    let sawNick = false;
    let sawUser = false;

    const flush = () => {
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        received.push(line);

        if (line.startsWith('NICK ')) {
          sawNick = true;
        }

        if (line.startsWith('USER ')) {
          sawUser = true;
        }

        if (sawNick && sawUser) {
          socket.write(':irc.example 001 tester :Welcome\r\n');
          sawNick = false;
          sawUser = false;
        }

        index = buffer.indexOf('\n');
      }
    };

    socket.on('data', (chunk) => {
      buffer += chunk;
      flush();
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: '127.0.0.1',
      port: address.port,
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
      onEvent: () => {},
    }
  );

  connection.connect();
  await waitFor(() => received.some((line) => line.startsWith('USER ')));
  await waitFor(() => received.some((line) => line.startsWith('NICK ')));

  connection.say('sofia', 'hello in private');

  await waitFor(() => received.includes('PRIVMSG sofia :hello in private'));

  connection.disconnect();
  server.close();
});

test('irc connection polls ISON and emits friend presence updates', async () => {
  const received: string[] = [];
  const events: Array<{ type: string; [key: string]: unknown }> = [];

  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    let sawNick = false;
    let sawUser = false;

    const flush = () => {
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        received.push(line);

        if (line.startsWith('NICK ')) {
          sawNick = true;
        }

        if (line.startsWith('USER ')) {
          sawUser = true;
        }

        if (sawNick && sawUser) {
          socket.write(':irc.example 001 tester :Welcome\r\n');
          sawNick = false;
          sawUser = false;
        }

        if (line === 'ISON Alice Bob') {
          socket.write(':irc.example 303 tester :Alice\r\n');
        }

        index = buffer.indexOf('\n');
      }
    };

    socket.on('data', (chunk) => {
      buffer += chunk;
      flush();
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: '127.0.0.1',
      port: address.port,
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

  connection.setFriendNicks(['Alice', 'Bob']);
  connection.connect();

  await waitFor(() => received.includes('ISON Alice Bob'));
  await waitFor(
    () =>
      events.some(
        (event) =>
          event.type === 'friend-presence'
          && Array.isArray(event.onlineNicks)
          && event.onlineNicks.length === 1
          && event.onlineNicks[0] === 'Alice'
      )
  );

  connection.disconnect();
  server.close();
});

test('raw ISON replies stay in the originating buffer and do not affect friend presence', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.sendClientRaw('ISON helper', '#chat');
  connection.consume(':irc.example 303 tester :helper\r\n');

  assert.deepEqual(writes, ['ISON helper\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#chat'
        && event.message === '* Online: helper'
    )
  );
  assert.equal(events.some((event) => event.type === 'friend-presence'), false);
});

test('irc connection splits oversized ISON polls and aggregates replies', async () => {
  const received: string[] = [];
  const events: Array<{ type: string; [key: string]: unknown }> = [];

  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    let sawNick = false;
    let sawUser = false;

    const flush = () => {
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        received.push(line);

        if (line.startsWith('NICK ')) {
          sawNick = true;
        }

        if (line.startsWith('USER ')) {
          sawUser = true;
        }

        if (sawNick && sawUser) {
          socket.write(':irc.example 001 tester :Welcome\r\n');
          sawNick = false;
          sawUser = false;
        }

        if (line.startsWith('ISON ')) {
          const firstNick = line.slice('ISON '.length).trim().split(/\s+/)[0];
          socket.write(`:irc.example 303 tester :${firstNick}\r\n`);
        }

        index = buffer.indexOf('\n');
      }
    };

    socket.on('data', (chunk) => {
      buffer += chunk;
      flush();
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: '127.0.0.1',
      port: address.port,
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

  const trackedFriends = Array.from({ length: 80 }, (_, index) => `Friend${index.toString().padStart(3, '0')}`);
  connection.setFriendNicks(trackedFriends);
  connection.connect();

  await waitFor(() => received.filter((line) => line.startsWith('ISON ')).length >= 2);
  const expectedOnline = received
    .filter((line) => line.startsWith('ISON '))
    .map((line) => line.slice('ISON '.length).trim().split(/\s+/)[0]!)
    .sort();
  await waitFor(
    () =>
      events.some(
        (event) =>
          event.type === 'friend-presence'
          && Array.isArray(event.onlineNicks)
          && [...(event.onlineNicks as string[])].sort().join(',') === expectedOnline.join(',')
      )
  );

  connection.disconnect();
  server.close();
});

test('irc connection ignores stale ISON replies when polls overlap', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.connected = false;
  connection.setFriendNicks(['Alice']);
  connection.connected = true;

  connection.refreshFriendPresence();
  connection.refreshFriendPresence();

  connection.consume(':irc.example 303 tester :Alice\r\n');
  assert.equal(events.some((event) => event.type === 'friend-presence'), false);

  connection.consume(':irc.example 303 tester :Alice\r\n');
  const friendPresenceEvents = events.filter((event) => event.type === 'friend-presence');
  assert.equal(friendPresenceEvents.length, 1);
  assert.deepEqual(friendPresenceEvents[0]?.onlineNicks, ['Alice']);
});

test('irc connection skips oversized friend nicks when polling ISON', () => {
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
    { onEvent() {} }
  );

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.setFriendNicks(['Alice', 'x'.repeat(600)]);

  assert.ok(writes.includes('ISON Alice\r\n'));
  assert.equal(writes.some((line) => line.includes('x'.repeat(600))), false);
});

test('irc connection times out stalled logins instead of hanging forever', async () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const previousTimeout = process.env.PULSETE_IRC_CONNECT_TIMEOUT_MS;
  process.env.PULSETE_IRC_CONNECT_TIMEOUT_MS = '50';

  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: '127.0.0.1',
      port: address.port,
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

  try {
    connection.connect();
    await waitFor(
      () =>
        events.some(
          (event) =>
            event.type === 'status'
            && event.kind === 'error'
            && String(event.message).includes('Connection timed out')
        ),
      400
    );
  } finally {
    connection.disconnect();
    if (previousTimeout === undefined) {
      delete process.env.PULSETE_IRC_CONNECT_TIMEOUT_MS;
    } else {
      process.env.PULSETE_IRC_CONNECT_TIMEOUT_MS = previousTimeout;
    }
    server.close();
  }
});

test('irc connection times out stalled logins even when the server stays chatty', async () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const previousTimeout = process.env.PULSETE_IRC_CONNECT_TIMEOUT_MS;
  process.env.PULSETE_IRC_CONNECT_TIMEOUT_MS = '80';

  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    socket.on('error', () => {});
    const interval = setInterval(() => {
      if (!socket.destroyed) {
        socket.write(':irc.example NOTICE tester :still registering\r\n');
      }
    }, 20);
    interval.unref?.();
    socket.on('close', () => clearInterval(interval));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: '127.0.0.1',
      port: address.port,
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

  try {
    connection.connect();
    await waitFor(
      () =>
        events.some(
          (event) =>
            event.type === 'status'
            && event.kind === 'error'
            && String(event.message).includes('Connection timed out')
        ),
      400
    );
  } finally {
    connection.disconnect();
    if (previousTimeout === undefined) {
      delete process.env.PULSETE_IRC_CONNECT_TIMEOUT_MS;
    } else {
      process.env.PULSETE_IRC_CONNECT_TIMEOUT_MS = previousTimeout;
    }
    server.close();
  }
});

test('irc connection drops oversized pending lines instead of buffering indefinitely', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  let destroyed = false;
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

  connection.socket = {
    destroy() {
      destroyed = true;
    },
  } as unknown as net.Socket;

  connection.consume('x'.repeat(20_000));

  assert.equal(destroyed, true);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.kind === 'error'
        && event.message === 'Server sent an oversized IRC line'
    )
  );
});

test('irc connection drops oversized complete lines before dispatching them', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  let destroyed = false;
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

  connection.socket = {
    destroy() {
      destroyed = true;
    },
  } as unknown as net.Socket;

  connection.consume(`:irc.example NOTICE tester :${'x'.repeat(20_000)}\r\n`);

  assert.equal(destroyed, true);
  assert.equal(events.some((event) => event.type === 'message'), false);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.kind === 'error'
        && event.message === 'Server sent an oversized IRC line'
    )
  );
});

test('irc connection accepts large chunks when they contain complete IRC lines', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  let destroyed = false;
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

  connection.socket = {
    destroy() {
      destroyed = true;
    },
  } as unknown as net.Socket;

  const chunk = Array.from({ length: 500 }, (_, index) => `:irc.example NOTICE tester :line ${index}\r\n`).join('');
  assert.ok(Buffer.byteLength(chunk, 'utf8') > 16 * 1024);

  connection.consume(chunk);

  assert.equal(destroyed, false);
  assert.equal(events.filter((event) => event.type === 'message').length, 500);
});

test('irc connection routes whois replies to the originating buffer', async () => {
  const received: string[] = [];
  const events: Array<{ type: string; [key: string]: unknown }> = [];

  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    let sawNick = false;
    let sawUser = false;

    const flush = () => {
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        received.push(line);

        if (line.startsWith('NICK ')) {
          sawNick = true;
        }

        if (line.startsWith('USER ')) {
          sawUser = true;
        }

        if (sawNick && sawUser) {
          socket.write(':irc.example 001 tester :Welcome\r\n');
          sawNick = false;
          sawUser = false;
        }

        if (line === 'WHOIS helper') {
          socket.write(':irc.example 311 tester helper helper users.example * :Helper Person\r\n');
          socket.write(':irc.example 319 tester helper :#chat @#ops\r\n');
          socket.write(':irc.example 312 tester helper irc.example :Example IRC Server\r\n');
          socket.write(':irc.example 317 tester helper 125 1700000000 :seconds idle, signon time\r\n');
          socket.write(':irc.example 318 tester helper :End of /WHOIS list.\r\n');
        }

        index = buffer.indexOf('\n');
      }
    };

    socket.on('data', (chunk) => {
      buffer += chunk;
      flush();
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: '127.0.0.1',
      port: address.port,
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

  connection.connect();

  await waitFor(() => events.some((event) => event.type === 'state' && event.connected === true));

  assert.equal(connection.sendClientRaw('WHOIS helper', '#chat'), true);

  await waitFor(
    () =>
      events.some(
        (event) =>
          event.type === 'status'
          && event.kind === 'system'
          && event.target === '#chat'
          && event.message === '* helper is helper@users.example (Helper Person)'
      )
      && events.some(
        (event) =>
          event.type === 'status'
          && event.kind === 'system'
          && event.target === '#chat'
          && event.message === '* helper is on #chat @#ops'
      )
      && events.some(
        (event) =>
          event.type === 'status'
          && event.kind === 'system'
          && event.target === '#chat'
          && event.message === '* helper is using irc.example (Example IRC Server)'
      )
      && events.some(
        (event) =>
          event.type === 'status'
          && event.kind === 'system'
          && event.target === '#chat'
          && event.message === '* helper has been idle for 2m 5s'
      )
      && events.some(
        (event) =>
          event.type === 'status'
          && event.kind === 'system'
          && event.target === '#chat'
          && event.message === '* End of WHOIS for helper'
      )
  );

  connection.disconnect();
  server.close();

  assert.ok(received.includes('WHOIS helper'));
});

test('irc connection routes duplicate WHOIS replies for the same nick in request order', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.sendClientRaw('WHOIS alice', '#first');
  connection.sendClientRaw('WHOIS alice', '#second');
  connection.consume(':irc.example 311 tester alice user host * :Alice Example\r\n');
  connection.consume(':irc.example 318 tester alice :End of /WHOIS list.\r\n');
  connection.consume(':irc.example 311 tester alice user host * :Alice Example\r\n');
  connection.consume(':irc.example 318 tester alice :End of /WHOIS list.\r\n');

  assert.deepEqual(writes, ['WHOIS alice\r\n', 'WHOIS alice\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#first'
        && event.kind === 'system'
        && event.message === '* alice is user@host (Alice Example)'
    )
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#first'
        && event.kind === 'system'
        && event.message === '* End of WHOIS for alice'
    )
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#second'
        && event.kind === 'system'
        && event.message === '* alice is user@host (Alice Example)'
    )
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#second'
        && event.kind === 'system'
        && event.message === '* End of WHOIS for alice'
    )
  );
});

test('irc connection keeps direct notices on the server buffer', async () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];

  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    let sawNick = false;
    let sawUser = false;

    const flush = () => {
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);

        if (line.startsWith('NICK ')) {
          sawNick = true;
        }

        if (line.startsWith('USER ')) {
          sawUser = true;
        }

        if (sawNick && sawUser) {
          socket.write(':irc.example 001 tester :Welcome\r\n');
          socket.write(':NickServ!service@example NOTICE tester :identify now\r\n');
          sawNick = false;
          sawUser = false;
        }

        index = buffer.indexOf('\n');
      }
    };

    socket.on('data', (chunk) => {
      buffer += chunk;
      flush();
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: '127.0.0.1',
      port: address.port,
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

  connection.connect();

  await waitFor(
    () =>
      events.some(
        (event) =>
          event.type === 'message' &&
          (event as { type: string; message: { target: string; kind: string; body: string } }).message.target === 'server' &&
          (event as { type: string; message: { target: string; kind: string; body: string } }).message.kind === 'notice' &&
          (event as { type: string; message: { target: string; kind: string; body: string } }).message.body === 'identify now'
      ),
    2_000
  );

  connection.disconnect();
  server.close();
});

test('irc connection keeps private-message delivery notices on the server buffer', async () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];

  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    let sawNick = false;
    let sawUser = false;

    const flush = () => {
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);

        if (line.startsWith('NICK ')) {
          sawNick = true;
        }

        if (line.startsWith('USER ')) {
          sawUser = true;
        }

        if (sawNick && sawUser) {
          socket.write(':irc.example 001 tester :Welcome\r\n');
          sawNick = false;
          sawUser = false;
        }

        if (line === 'PRIVMSG sofia :hello there') {
          socket.write(':irc.example NOTICE tester :You need to be identified to message that user\r\n');
        }

        index = buffer.indexOf('\n');
      }
    };

    socket.on('data', (chunk) => {
      buffer += chunk;
      flush();
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: '127.0.0.1',
      port: address.port,
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

  connection.connect();
  await waitFor(() => events.some((event) => event.type === 'state' && event.connected === true));

  connection.say('sofia', 'hello there', '#chat');

  await waitFor(
    () =>
      events.some(
        (event) =>
          event.type === 'message'
          && (event as { type: string; message: { target: string; kind: string; body: string } }).message.target === 'server'
          && (event as { type: string; message: { target: string; kind: string; body: string } }).message.kind === 'notice'
          && (event as { type: string; message: { target: string; kind: string; body: string } }).message.body
            === 'You need to be identified to message that user'
      ),
    2_000
  );

  connection.disconnect();
  server.close();
});

test('irc connection keeps unrelated direct server notices on the server buffer', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.say('sofia', 'hello there', '#chat');
  connection.consume(':irc.example NOTICE tester :maintenance soon\r\n');

  assert.deepEqual(writes, ['PRIVMSG sofia :hello there\r\n']);
  assert.ok(
    events.some(
      (event) => {
        const message = (event as { message?: { target?: string; kind?: string; body?: string } }).message;
        return event.type === 'message'
          && message?.target === 'server'
          && message.kind === 'notice'
          && message.body === 'maintenance soon';
      }
    )
  );
});

test('irc connection keeps unrelated auth notices on the server buffer', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.say('sofia', 'hello there', '#chat');
  connection.consume(':irc.example NOTICE tester :You need to be identified to use that command\r\n');

  assert.deepEqual(writes, ['PRIVMSG sofia :hello there\r\n']);
  assert.ok(
    events.some(
      (event) => {
        const message = (event as { message?: { target?: string; kind?: string; body?: string } }).message;
        return event.type === 'message'
          && message?.target === 'server'
          && message.kind === 'notice'
          && message.body === 'You need to be identified to use that command';
      }
    )
  );
});

test('irc connection keeps unrelated cannot-send notices on the server buffer', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.say('sofia', 'hello there', '#chat');
  connection.consume(':irc.example NOTICE tester :Cannot send invites while restricted\r\n');

  assert.deepEqual(writes, ['PRIVMSG sofia :hello there\r\n']);
  assert.ok(
    events.some(
      (event) => {
        const message = (event as { message?: { target?: string; kind?: string; body?: string } }).message;
        return event.type === 'message'
          && message?.target === 'server'
          && message.kind === 'notice'
          && message.body === 'Cannot send invites while restricted';
      }
    )
  );
});

test('irc connection keeps message blocked notices on the server buffer', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.say('sofia', 'hello there', '#chat');
  connection.consume(':irc.example NOTICE tester :Message blocked by policy\r\n');

  assert.deepEqual(writes, ['PRIVMSG sofia :hello there\r\n']);
  assert.ok(
    events.some(
      (event) => {
        const message = (event as { message?: { target?: string; kind?: string; body?: string } }).message;
        return event.type === 'message'
          && message?.target === 'server'
          && message.kind === 'notice'
          && message.body === 'Message blocked by policy';
      }
    )
  );
});

test('irc connection keeps ambiguous delivery notices on the server buffer', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.say('alice', 'hi', '#chat-a');
  connection.say('bob', 'hi', '#chat-b');
  connection.consume(':irc.example NOTICE tester :Delivery failed\r\n');

  assert.deepEqual(writes, ['PRIVMSG alice :hi\r\n', 'PRIVMSG bob :hi\r\n']);
  assert.ok(
    events.some(
      (event) => {
        const message = (event as { message?: { target?: string; kind?: string; body?: string } }).message;
        return event.type === 'message'
          && message?.target === 'server'
          && message.kind === 'notice'
          && message.body === 'Delivery failed';
      }
    )
  );
  assert.ok(
    !events.some(
      (event) => {
        const message = (event as { message?: { target?: string; body?: string } }).message;
        return event.type === 'message'
          && (message?.target === '#chat-a' || message?.target === '#chat-b')
          && message.body === 'Delivery failed';
      }
    )
  );
});

test('irc connection keeps delivery notices on the server buffer after channel messages', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.say('#chat', 'hello there', '#chat');
  connection.consume(':irc.example NOTICE tester :Delivery failed\r\n');

  assert.deepEqual(writes, ['PRIVMSG #chat :hello there\r\n']);
  assert.ok(
    events.some(
      (event) => {
        const message = (event as { message?: { target?: string; kind?: string; body?: string } }).message;
        return event.type === 'message'
          && message?.target === 'server'
          && message.kind === 'notice'
          && message.body === 'Delivery failed';
      }
    )
  );
  assert.ok(
    !events.some(
      (event) => {
        const message = (event as { message?: { target?: string; body?: string } }).message;
        return event.type === 'message'
          && message?.target === '#chat'
          && message.body === 'Delivery failed';
      }
    )
  );
});

test('irc connection keeps direct notices on the server buffer after generic raw commands', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.sendClientRaw('LIST', '#chat');
  connection.consume(':irc.example NOTICE tester :maintenance soon\r\n');

  assert.deepEqual(writes, ['LIST\r\n']);
  assert.ok(
    events.some(
      (event) => {
        const message = (event as { message?: { target?: string; kind?: string; body?: string } }).message;
        return event.type === 'message'
          && message?.target === 'server'
          && message.kind === 'notice'
          && message.body === 'maintenance soon';
      }
    )
  );
});

test('irc connection keeps raw MODE 401 replies from stale private-message contexts', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.say('sofia', 'hello there', '#chat');
  connection.sendClientRaw('MODE sofia', '#server');
  connection.consume(':irc.example 401 tester sofia :No such nick/channel\r\n');

  assert.deepEqual(writes, ['PRIVMSG sofia :hello there\r\n', 'MODE sofia\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === 'server'
        && event.kind === 'error'
        && event.message === '* No such nick/channel: sofia'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#chat'
        && event.message === '* No such nick/channel: sofia'
    )
  );
});

test('irc connection clears raw MODE contexts after untargeted mode errors', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.sendClientRaw('MODE alice', '#server');
  connection.consume(':irc.example 502 tester :Cant change mode for other users\r\n');
  connection.say('alice', 'hi', '#chat');
  connection.consume(':irc.example 401 tester alice :No such nick/channel\r\n');

  assert.deepEqual(writes, ['MODE alice\r\n', 'PRIVMSG alice :hi\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === 'server'
        && event.kind === 'error'
        && event.message === '* Cant change mode for other users'
    )
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#chat'
        && event.kind === 'error'
        && event.message === '* No such nick/channel: alice'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === 'server'
        && event.message === '* No such nick/channel: alice'
    )
  );
});

test('irc connection clears duplicate raw MODE contexts after untargeted mode errors', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.sendClientRaw('MODE alice', '#server-a');
  connection.sendClientRaw('MODE bob', '#server-b');
  connection.consume(':irc.example 502 tester :Cant change mode for other users\r\n');
  connection.say('bob', 'hi', '#chat-b');
  connection.consume(':irc.example 401 tester bob :No such nick/channel\r\n');

  assert.deepEqual(writes, ['MODE alice\r\n', 'MODE bob\r\n', 'PRIVMSG bob :hi\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#chat-b'
        && event.kind === 'error'
        && event.message === '* No such nick/channel: bob'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === 'server'
        && event.message === '* No such nick/channel: bob'
    )
  );
});

test('irc connection clears duplicate raw MODE contexts after targeted mode errors', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.sendClientRaw('MODE bob', '#server-a');
  connection.sendClientRaw('MODE bob', '#server-b');
  connection.consume(':irc.example 401 tester bob :No such nick/channel\r\n');
  connection.say('bob', 'hi', '#chat-b');
  connection.consume(':irc.example 401 tester bob :No such nick/channel\r\n');

  assert.deepEqual(writes, ['MODE bob\r\n', 'MODE bob\r\n', 'PRIVMSG bob :hi\r\n']);
  const bobErrors = events.filter(
    (event) =>
      event.type === 'status'
      && event.kind === 'error'
      && event.message === '* No such nick/channel: bob'
  );
  assert.deepEqual(
    bobErrors.map((event) => event.target),
    ['server', '#chat-b']
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#chat-b'
        && event.kind === 'error'
        && event.message === '* No such nick/channel: bob'
    )
  );
});

test('irc connection keeps WHOIS 401 replies out of stale private-message contexts', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.sendClientRaw('WHOIS alice', '#whois');
  connection.say('alice', 'hi', '#chat');
  connection.consume(':irc.example 401 tester alice :No such nick/channel\r\n');

  assert.deepEqual(writes, ['WHOIS alice\r\n', 'PRIVMSG alice :hi\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#whois'
        && event.kind === 'error'
        && event.message === '* No such nick/channel: alice'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#chat'
        && event.message === '* No such nick/channel: alice'
    )
  );
});

test('irc connection keeps private-message 401 replies on the source buffer', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.say('alice', 'hi', '#chat');
  connection.consume(':irc.example 401 tester alice :No such nick/channel\r\n');

  assert.deepEqual(writes, ['PRIVMSG alice :hi\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#chat'
        && event.kind === 'error'
        && event.message === '* No such nick/channel: alice'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === 'server'
        && event.message === '* No such nick/channel: alice'
    )
  );
});

test('irc connection keeps generic raw-command numerics on the server buffer', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.sendClientRaw('LIST', '#chat');
  connection.consume(':irc.example 372 tester :- motd line\r\n');

  assert.deepEqual(writes, ['LIST\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === undefined
        && event.kind === 'system'
        && event.message === '* - motd line'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#chat'
        && event.message === '* - motd line'
    )
  );
});

test('irc connection keeps topic errors bound to topic commands on the same channel', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.sendClientRaw('TOPIC #help :new topic', '#topic');
  connection.part('#help', 'Leaving', '#part');
  connection.consume(':irc.example 482 tester #help :You\'re not channel operator\r\n');

  assert.deepEqual(writes, ['TOPIC #help :new topic\r\n', 'PART #help :Leaving\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#topic'
        && event.kind === 'error'
        && event.message === '* #help You\'re not channel operator'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#part'
        && event.message === '* #help You\'re not channel operator'
    )
  );
});

test('irc connection keeps ambiguous same-channel 442 replies on the server buffer', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.sendClientRaw('TOPIC #help :new topic', '#topic');
  connection.part('#help', 'Leaving', '#part');
  connection.consume(':irc.example 442 tester #help :You\'re not on that channel\r\n');

  assert.deepEqual(writes, ['TOPIC #help :new topic\r\n', 'PART #help :Leaving\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === undefined
        && event.kind === 'error'
        && event.message === '* #help You\'re not on that channel'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#topic'
        && event.message === '* #help You\'re not on that channel'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#part'
        && event.message === '* #help You\'re not on that channel'
    )
  );
});

test('irc connection clears ambiguous same-channel 442 contexts before later replies', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.sendClientRaw('TOPIC #help :old topic', '#topic-old');
  connection.part('#help', 'Leaving', '#part-old');
  connection.consume(':irc.example 442 tester #help :You\'re not on that channel\r\n');
  connection.consume(':irc.example 482 tester #help :You\'re not channel operator\r\n');

  assert.deepEqual(writes, ['TOPIC #help :old topic\r\n', 'PART #help :Leaving\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === undefined
        && event.kind === 'error'
        && event.message === '* #help You\'re not channel operator'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#topic-old'
        && event.message === '* #help You\'re not channel operator'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#part-old'
        && event.message === '* #help You\'re not channel operator'
    )
  );
});

test('irc connection clears successful topic-change contexts before later topic numerics', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;
  connection.channelUsers.set('#help', []);

  connection.sendClientRaw('TOPIC #help :old topic', '#topic-old');
  connection.consume(':tester!user@host TOPIC #help :old topic\r\n');
  connection.sendClientRaw('TOPIC #help', '#topic-query');
  connection.consume(':irc.example 332 tester #help :current topic\r\n');

  assert.deepEqual(writes, ['TOPIC #help :old topic\r\n', 'TOPIC #help\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === 'server'
        && event.kind === 'system'
        && event.message === '* #help current topic'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#topic-old'
        && event.message === '* #help current topic'
    )
  );
});

test('irc connection clears duplicate successful topic-change contexts before later topic numerics', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;
  connection.channelUsers.set('#help', []);

  connection.sendClientRaw('TOPIC #help :one', '#topic-a');
  connection.sendClientRaw('TOPIC #help :two', '#topic-b');
  connection.consume(':tester!user@host TOPIC #help :two\r\n');
  connection.sendClientRaw('TOPIC #help', '#topic-query');
  connection.consume(':irc.example 332 tester #help :two\r\n');

  assert.deepEqual(writes, ['TOPIC #help :one\r\n', 'TOPIC #help :two\r\n', 'TOPIC #help\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === 'server'
        && event.kind === 'system'
        && event.message === '* #help two'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && (event.target === '#topic-a' || event.target === '#topic-b')
        && event.message === '* #help two'
    )
  );
});

test('irc connection surfaces otherwise unformatted numerics from raw commands', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.sendClientRaw('MODE #help', '#chat');
  connection.consume(':irc.example 324 tester #help +nt\r\n');

  assert.deepEqual(writes, ['MODE #help\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === undefined
        && event.kind === 'system'
        && event.message === '* #help +nt'
    )
  );
});

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

  connection.connected = true;
  connection.socket = {
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

  connection.connected = true;
  connection.socket = {
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
test('irc connection marks rejected joins for channel rollback', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.join('#missing', '#chat', 'buffer-1');
  connection.consume(':irc.example 403 tester #missing :No such channel\r\n');

  assert.deepEqual(writes, ['JOIN #missing\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#chat'
        && String(event.message).includes('No such channel')
        && event.failedChannelJoinTarget === '#missing'
        && event.failedChannelJoinBufferId === 'buffer-1'
    )
  );
});

test('irc connection marks 437 rejected joins for channel rollback', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.join('#missing', '#chat', 'buffer-437');
  connection.consume(':irc.example 437 tester #missing :Channel is temporarily unavailable\r\n');

  assert.deepEqual(writes, ['JOIN #missing\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#chat'
        && String(event.message).includes('Channel is temporarily unavailable')
        && event.failedChannelJoinTarget === '#missing'
        && event.failedChannelJoinBufferId === 'buffer-437'
    )
  );
});

test('irc connection keeps pending nick changes from stealing channel 437 replies', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.setNick('newnick', '#chat');
  connection.join('#missing', '#chat', 'buffer-mixed-437');
  connection.consume(':irc.example 437 tester #missing :Channel is temporarily unavailable\r\n');

  assert.deepEqual(writes, ['NICK newnick\r\n', 'JOIN #missing\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#chat'
        && String(event.message).includes('Channel is temporarily unavailable')
        && event.failedChannelJoinTarget === '#missing'
        && event.failedChannelJoinBufferId === 'buffer-mixed-437'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.message === 'newnick was rejected by the server'
    )
  );
});

test('irc connection keeps channel 437 replies out of nick contexts regardless of queue order', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.join('#missing', '#chat', 'buffer-437-after-nick');
  connection.setNick('newnick', '#chat');
  connection.consume(':irc.example 437 tester #missing :Channel is temporarily unavailable\r\n');

  assert.deepEqual(writes, ['JOIN #missing\r\n', 'NICK newnick\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#chat'
        && String(event.message).includes('Channel is temporarily unavailable')
        && event.failedChannelJoinTarget === '#missing'
        && event.failedChannelJoinBufferId === 'buffer-437-after-nick'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.message === 'newnick was rejected by the server'
    )
  );
});

test('irc connection clears join rollback metadata after a successful self join', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.join('#help', '#chat', 'buffer-live');
  connection.consume(':tester!user@host JOIN #help\r\n');
  connection.consume(':irc.example 473 tester #help :Cannot join channel (+i)\r\n');

  assert.deepEqual(writes, ['JOIN #help\r\n']);
  assert.ok(
    events.some(
      (event) => {
        const message = (event as { message?: { target?: string; kind?: string; body?: string } }).message;
        return event.type === 'message'
          && message?.target === '#help'
          && message.kind === 'join'
          && message.body === 'tester joined #help';
      }
    )
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && String(event.message).includes('Cannot join channel (+i)')
        && event.failedChannelJoinTarget === undefined
        && event.failedChannelJoinBufferId === undefined
    )
  );
});

test('irc connection clears all pending join rollback metadata after duplicate self joins succeed', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.join('#help', '#chat', 'buffer-live');
  connection.join('#help', '#chat');
  connection.consume(':tester!user@host JOIN #help\r\n');
  connection.consume(':irc.example 473 tester #help :Cannot join channel (+i)\r\n');

  assert.deepEqual(writes, ['JOIN #help\r\n', 'JOIN #help\r\n']);
  assert.ok(
    events.some(
      (event) => {
        const message = (event as { message?: { target?: string; kind?: string; body?: string } }).message;
        return event.type === 'message'
          && message?.target === '#help'
          && message.kind === 'join'
          && message.body === 'tester joined #help';
      }
    )
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && String(event.message).includes('Cannot join channel (+i)')
        && event.failedChannelJoinTarget === undefined
        && event.failedChannelJoinBufferId === undefined
    )
  );
});

test('irc connection surfaces private-message delivery errors from the server', async () => {
  const received: string[] = [];
  const events: Array<{ type: string; [key: string]: unknown }> = [];

  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    let sawNick = false;
    let sawUser = false;

    const flush = () => {
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        received.push(line);

        if (line.startsWith('NICK ')) {
          sawNick = true;
        }

        if (line.startsWith('USER ')) {
          sawUser = true;
        }

        if (sawNick && sawUser) {
          socket.write(':irc.example 001 tester :Welcome\r\n');
          sawNick = false;
          sawUser = false;
        }

        if (line === 'PRIVMSG sofia :hello there') {
          socket.write(':irc.example 716 tester sofia :is in +g mode (server-side ignore)\r\n');
        }

        index = buffer.indexOf('\n');
      }
    };

    socket.on('data', (chunk) => {
      buffer += chunk;
      flush();
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: '127.0.0.1',
      port: address.port,
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

  connection.connect();
  await waitFor(() => events.some((event) => event.type === 'state' && event.connected === true));

  connection.say('sofia', 'hello there', '#chat');

  await waitFor(
    () =>
      events.some(
        (event) =>
          event.type === 'status' &&
          event.kind === 'error' &&
          event.target === '#chat' &&
          event.message === '* sofia is in +g mode (server-side ignore)'
      )
  );

  connection.disconnect();
  server.close();
});

test('irc connection keeps direct service messages on the server buffer', async () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];

  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    let sawNick = false;
    let sawUser = false;

    const flush = () => {
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);

        if (line.startsWith('NICK ')) {
          sawNick = true;
        }

        if (line.startsWith('USER ')) {
          sawUser = true;
        }

        if (sawNick && sawUser) {
          socket.write(':irc.example 001 tester :Welcome\r\n');
          socket.write(':NickServ!service@example PRIVMSG tester :Use IDENTIFY first\r\n');
          sawNick = false;
          sawUser = false;
        }

        index = buffer.indexOf('\n');
      }
    };

    socket.on('data', (chunk) => {
      buffer += chunk;
      flush();
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: '127.0.0.1',
      port: address.port,
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

  connection.connect();

  await waitFor(
    () =>
      events.some(
        (event) =>
          event.type === 'message'
          && (event as { type: string; message: { target: string; kind: string; body: string } }).message.target === 'server'
          && (event as { type: string; message: { target: string; kind: string; body: string } }).message.kind === 'line'
          && (event as { type: string; message: { target: string; kind: string; body: string } }).message.body === 'Use IDENTIFY first'
      ),
    2_000
  );

  assert.equal(
    events.some(
      (event) =>
        event.type === 'message'
        && (event as { type: string; message: { target: string } }).message.target === 'NickServ'
    ),
    false
  );

  connection.disconnect();
  server.close();
});

test('irc connection reports failed connects without a generic closed notice', async () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const server = net.createServer();

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const { port } = address;

  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'BrokenNet',
      host: '127.0.0.1',
      port,
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

  connection.connect();

  await waitFor(
    () =>
      events.some(
        (event) =>
          event.type === 'status'
          && event.kind === 'error'
          && String(event.message).includes(`Unable to connect to 127.0.0.1:${port}`)
      )
  );
  await new Promise((resolve) => setTimeout(resolve, 150));

  assert.ok(!events.some((event) => event.type === 'status' && event.message === 'Connection closed'));

  connection.disconnect();
});

test('irc connection keeps direct ctcp requests on the server buffer', async () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];

  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    let sawNick = false;
    let sawUser = false;

    const flush = () => {
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);

        if (line.startsWith('NICK ')) {
          sawNick = true;
        }

        if (line.startsWith('USER ')) {
          sawUser = true;
        }

        if (sawNick && sawUser) {
          socket.write(':irc.example 001 tester :Welcome\r\n');
          socket.write(':CTCPServ!service@example PRIVMSG tester :\u0001VERSION\u0001\r\n');
          sawNick = false;
          sawUser = false;
        }

        index = buffer.indexOf('\n');
      }
    };

    socket.on('data', (chunk) => {
      buffer += chunk;
      flush();
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: '127.0.0.1',
      port: address.port,
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

  connection.connect();

  await waitFor(
    () =>
      events.some(
        (event) =>
          event.type === 'message' &&
          (event as { type: string; message: { target: string; kind: string; body: string } }).message.target === 'server' &&
          (event as { type: string; message: { target: string; kind: string; body: string } }).message.kind === 'line' &&
          (event as { type: string; message: { target: string; kind: string; body: string } }).message.body === '<VERSION>'
      ),
    2_000
  );

  connection.disconnect();
  server.close();
});
