import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSlashIrcClientCommand } from '../shared/irc-client-command.js';

test('/hs normalizes to the hostserv command', () => {
  assert.deepEqual(parseSlashIrcClientCommand('/hs help'), {
    name: 'hostserv',
    args: ['help'],
    remainder: 'help',
  });
});

test('/hostserv keeps the canonical hostserv command name', () => {
  assert.deepEqual(parseSlashIrcClientCommand('/hostserv vhost'), {
    name: 'hostserv',
    args: ['vhost'],
    remainder: 'vhost',
  });
});
