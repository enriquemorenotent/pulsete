import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import WebSocket from 'ws';
import { RuntimeSocketHub } from '../server/runtime-socket-hub.js';
import { createWebSocketTestDouble } from './helpers/websocket-test-doubles.js';

class FakeSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  closeCalls = 0;

  close() {
    this.closeCalls += 1;
    this.readyState = WebSocket.CLOSED;
    this.emit('close');
  }

  send() {}
}

test('runtime socket hub removes close listeners when detaching sockets', () => {
  const dropped: WebSocket[] = [];
  const hub = new RuntimeSocketHub((ws) => dropped.push(ws));
  const socket = createWebSocketTestDouble(new FakeSocket());

  hub.attach(socket);
  assert.equal(socket.listenerCount('close'), 1);

  hub.detach(socket);

  assert.equal(socket.listenerCount('close'), 0);
  assert.deepEqual(dropped, [socket]);

  socket.emit('close');
  assert.deepEqual(dropped, [socket]);
});

test('runtime socket hub removes close listeners while closing all sockets', () => {
  const dropped: WebSocket[] = [];
  const hub = new RuntimeSocketHub((ws) => dropped.push(ws));
  const socket = createWebSocketTestDouble(new FakeSocket());

  hub.attach(socket);
  hub.closeAll();

  assert.equal(socket.closeCalls, 1);
  assert.equal(socket.listenerCount('close'), 0);
  assert.deepEqual(dropped, [socket]);
});
