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

test('irc connection routes command notices to the originating buffer', async () => {
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
          && (event as { type: string; message: { target: string; kind: string; body: string } }).message.target === '#chat'
          && (event as { type: string; message: { target: string; kind: string; body: string } }).message.kind === 'notice'
          && (event as { type: string; message: { target: string; kind: string; body: string } }).message.body
            === 'You need to be identified to message that user'
      ),
    2_000
  );

  connection.disconnect();
  server.close();
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
