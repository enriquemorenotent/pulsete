import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SERVER_SIDEBAR_ACCORDION_STORAGE_KEY,
  getServerSidebarAccordionStorageKey,
  isServerSidebarAccordionOpen,
  parseServerSidebarAccordionState,
  serializeServerSidebarAccordionState,
} from '../web/src/server-sidebar-accordion-state.js';

test('server sidebar accordion state parses only known boolean sections', () => {
  assert.deepEqual(parseServerSidebarAccordionState(null), {});
  assert.deepEqual(parseServerSidebarAccordionState('not json'), {});
  assert.deepEqual(
    parseServerSidebarAccordionState(JSON.stringify({
      capabilities: false,
      connection: true,
      junk: false,
      notes: 'closed',
    })),
    { capabilities: false, connection: true },
  );
});

test('server sidebar keeps connection visible and secondary details collapsed by default', () => {
  assert.equal(isServerSidebarAccordionOpen({}, 'connection'), true);
  assert.equal(isServerSidebarAccordionOpen({}, 'history'), false);
  assert.equal(isServerSidebarAccordionOpen({}, 'notes'), false);
  assert.equal(isServerSidebarAccordionOpen({ history: true }, 'history'), true);
  assert.equal(isServerSidebarAccordionOpen({ history: false }, 'history'), false);
});

test('legacy accordion keys remain separate per server during migration', () => {
  assert.equal(
    getServerSidebarAccordionStorageKey('network-1'),
    `${SERVER_SIDEBAR_ACCORDION_STORAGE_KEY}.network-1`,
  );
  assert.notEqual(
    getServerSidebarAccordionStorageKey('network-1'),
    getServerSidebarAccordionStorageKey('network-2'),
  );
  assert.equal(
    serializeServerSidebarAccordionState({ capabilities: false, notes: true }),
    '{"capabilities":false,"notes":true}',
  );
});
