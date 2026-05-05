import assert from 'node:assert/strict';
import test from 'node:test';
import { makeMessage } from './chat-pane.test.fixtures.js';
import { renderServerPane } from './chat-pane.test.renderers.js';

test('server tab groups routine source labels once and keeps timestamps visible', () => {
  const markup = renderServerPane([
    makeMessage({ id: 'message-1', nick: null, body: 'Connected', kind: 'system', ts: 1 }),
    makeMessage({ id: 'message-2', nick: null, body: '* Welcome', kind: 'system', ts: 2 }),
    makeMessage({ id: 'message-3', nick: null, body: 'Maintenance soon', kind: 'notice', ts: 3 }),
    makeMessage({ id: 'message-4', nick: 'StatServ', body: '<VERSION>', kind: 'line', ts: 4 }),
  ]);

  const serverLabels = markup.match(/>Server</g) ?? [];
  const visibleTimestamps = markup.match(
    /<time class="shrink-0 font-sans tabular-nums text-\[11px\] leading-5 text-muted-foreground\/58"/g,
  ) ?? [];
  assert.equal(serverLabels.length, 1);
  assert.equal(visibleTimestamps.length, 4);
  assert.match(markup, /data-server-message-group-source="Server"/);
  assert.match(markup, /data-server-message-group-source="Notice"/);
  assert.match(markup, /data-server-message-group-source="StatServ"/);
  assert.match(markup, />Notice</);
  assert.match(markup, /border-t border-white\/\[0\.035\] pt-1\.5/);
  assert.match(markup, /grid min-w-0 grid-cols-\[3\.25rem_minmax\(0,1fr\)\] gap-x-2 py-0\.5/);
  assert.match(markup, /dateTime="1970-01-01T00:00:00.001Z"/);
  assert.match(markup, /data-message-id="message-1"[\s\S]*Connected/);
  assert.match(markup, /data-message-id="message-2"[\s\S]*Welcome/);
  assert.match(markup, /data-message-id="message-4"[\s\S]*&lt;VERSION&gt;/);
  assert.doesNotMatch(markup, />\* Welcome</);
  assert.doesNotMatch(markup, />StatServ<\/span>/);
  assert.doesNotMatch(markup, /invisible shrink-0 font-sans tabular-nums/);
  assert.doesNotMatch(markup, /opacity-0 transition-opacity/);
  assert.doesNotMatch(markup, /text-\[15px\] font-semibold/);
  assert.doesNotMatch(markup, /flex min-w-0 flex-wrap items-baseline/);
  assert.match(markup, /<p class="min-w-0 break-words text-\[13px\] leading-5 text-\[var\(--transcript-secondary\)\]">/);
});
