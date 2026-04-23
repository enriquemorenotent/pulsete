import assert from 'node:assert/strict';
import test from 'node:test';
import { makeMessage } from './chat-pane.test.fixtures.js';
import { renderChatPane, renderQueryPane, renderServerPane } from './chat-pane.test.renderers.js';



test('consecutive sender messages repeat the same inline nick label in chat mode', () => {
  const markup = renderChatPane([
    makeMessage({ id: 'message-1', nick: 'Joby', body: 'first', ts: 1 }),
    makeMessage({ id: 'message-2', nick: 'Joby', body: 'second', ts: 2 }),
  ]);

  const nickLabels = markup.match(/>Joby</g) ?? [];
  assert.equal(nickLabels.length, 2);
  assert.match(markup, /first/);
  assert.match(markup, /second/);
  assert.doesNotMatch(markup, /data-message-avatar=/);
});

test('compact sender rows keep a one-character nick label without avatar markup', () => {
  const markup = renderChatPane([
    makeMessage({ id: 'message-1', nick: 'Q', body: 'waves', kind: 'action', ts: 1 }),
  ]);

  assert.match(markup, />Q</);
  assert.doesNotMatch(markup, /data-message-avatar=/);
});

test('transcript rows render without boxed message chrome', () => {
  const markup = renderChatPane([
    makeMessage({ id: 'message-1', nick: 'Joby', body: 'plain line', ts: 1 }),
    makeMessage({ id: 'message-2', nick: 'Server', body: 'Heads up', kind: 'notice', ts: 2 }),
  ]);

  assert.doesNotMatch(markup, /border px-2 py-1\.5/);
});

test('part and quit rows render with distinct tones', () => {
  const markup = renderChatPane([
    makeMessage({ id: 'message-1', nick: 'Joby', body: 'left', kind: 'part', ts: 1 }),
    makeMessage({ id: 'message-2', nick: 'Joby', body: 'quit', kind: 'quit', ts: 2 }),
  ]);

  assert.match(markup, /text-amber-300/);
  assert.match(markup, /text-red-500/);
});

test('compact chat rows use one grid skeleton for plain text and inline previews', () => {
  const plainMarkup = renderChatPane([
    makeMessage({ id: 'message-1', nick: 'Joby', body: 'plain line', ts: 1 }),
  ]);
  const previewMarkup = renderChatPane([
    makeMessage({ id: 'message-2', nick: 'Joby', body: 'Look https://example.test/cat.png', ts: 1 }),
  ]);

  assert.match(plainMarkup, /grid items-start grid-cols-\[max-content_minmax\(0,1fr\)\] gap-x-2 gap-y-1/);
  assert.match(previewMarkup, /grid items-start grid-cols-\[max-content_minmax\(0,1fr\)\] gap-x-2 gap-y-1/);
  assert.match(previewMarkup, /Inline image preview: cat\.png/);
  assert.match(previewMarkup, /Look /);
  assert.doesNotMatch(previewMarkup, /col-start-2/);
});

test('message rows render a compact time with full datetime metadata', () => {
  const timestamp = new Date(2026, 2, 11, 2, 57, 36, 0).getTime();
  const markup = renderChatPane([
    makeMessage({
      id: 'message-1',
      nick: 'Joby',
      body: 'timestamped',
      ts: timestamp,
    }),
  ]);

  assert.match(markup, />02:57<\/time>/);
  assert.match(markup, /title="2026-03-11 02:57:36"/);
  assert.match(markup, new RegExp(`dateTime="${new Date(timestamp).toISOString()}"`));
  assert.match(markup, /font-sans tabular-nums text-\[11px\] leading-5 text-muted-foreground/);
});

test('channel transcripts render day dividers when the calendar day changes', () => {
  const markup = renderChatPane([
    makeMessage({ id: 'message-1', body: 'late night', ts: new Date(2000, 0, 1, 23, 58, 0, 0).getTime() }),
    makeMessage({ id: 'message-2', body: 'next day', ts: new Date(2000, 0, 2, 0, 3, 0, 0).getTime() }),
  ]);

  assert.match(markup, /2000-01-01/);
  assert.match(markup, /2000-01-02/);
  assert.match(markup, /2000-01-01[\s\S]*late night/);
  assert.match(markup, /2000-01-02[\s\S]*next day/);
  assert.match(markup, /sticky top-0 z-10 -mx-4 mb-3 bg-background\/80 px-4 py-2 backdrop-blur-sm/);
});

test('compact rows suppress repeated timestamps for the same sender within the same minute', () => {
  const markup = renderChatPane([
    makeMessage({ id: 'message-1', nick: 'Joby', body: 'first', ts: new Date(2026, 2, 11, 2, 57, 1, 0).getTime() }),
    makeMessage({ id: 'message-2', nick: 'Joby', body: 'second', ts: new Date(2026, 2, 11, 2, 57, 40, 0).getTime() }),
    makeMessage({ id: 'message-3', nick: 'Joby', body: 'third', ts: new Date(2026, 2, 11, 2, 58, 0, 0).getTime() }),
  ]);

  const visibleTimestampMetadata = markup.match(/title="2026-03-11 02:(57|58):/g) ?? [];
  assert.equal(visibleTimestampMetadata.length, 2);
  assert.match(markup, /invisible shrink-0 font-sans tabular-nums text-\[11px\] leading-5 text-muted-foreground/);
});

test('private-message rows color self and peer nick labels differently', () => {
  const markup = renderQueryPane([
    makeMessage({ id: 'message-1', nick: 'sofia', self: true, target: 'MissD', body: 'hey', ts: 1 }),
    makeMessage({ id: 'message-2', nick: 'MissD', self: false, target: 'MissD', body: 'hi', ts: 2 }),
  ]);

  assert.match(markup, /class="mr-2 font-sans font-semibold text-primary">sofia</);
  assert.match(markup, /class="mr-2 font-sans font-semibold text-success">MissD</);
});

test('channel rows highlight self nick labels without tinting normal participants', () => {
  const markup = renderChatPane([
    makeMessage({ id: 'message-1', nick: 'sofia', self: true, body: 'my line', ts: 1 }),
    makeMessage({ id: 'message-2', nick: 'Joby', body: 'plain line', ts: 2 }),
  ]);

  assert.match(markup, /class="mr-2 font-sans font-semibold text-primary">sofia</);
  assert.match(markup, /aria-label="Open private message with Joby"/);
  assert.match(markup, /class="[^"]*mr-2 font-sans font-semibold text-inherit[^"]*">Joby</);
  assert.doesNotMatch(markup, /aria-label="Open private message with sofia"/);
});

test('channel rows tint peer nick labels by their channel mode', () => {
  const markup = renderChatPane(
    [
      makeMessage({ id: 'message-1', nick: 'Opal', body: 'operator line', ts: 1 }),
      makeMessage({ id: 'message-2', nick: 'Vox', body: 'voiced line', ts: 2 }),
      makeMessage({ id: 'message-3', nick: 'Guest', body: 'plain line', ts: 3 }),
    ],
    {
      channelUsers: [
        { nick: 'Opal', mode: 'op', away: false },
        { nick: 'Vox', mode: 'voice', away: false },
        { nick: 'Guest', mode: 'normal', away: false },
      ],
    },
  );

  assert.match(markup, /aria-label="Open private message with Opal"/);
  assert.match(markup, /class="[^"]*mr-2 font-sans font-semibold text-amber-300[^"]*">Opal</);
  assert.match(markup, /class="[^"]*mr-2 font-sans font-semibold text-emerald-300[^"]*">Vox</);
  assert.match(markup, /class="[^"]*mr-2 font-sans font-semibold text-inherit[^"]*">Guest</);
});

test('query and server transcripts keep participant labels non-clickable', () => {
  const queryMarkup = renderQueryPane([
    makeMessage({ id: 'message-1', nick: 'MissD', target: 'MissD', body: 'hi', ts: 1 }),
  ]);
  const serverMarkup = renderServerPane([
    makeMessage({ id: 'message-1', nick: 'OperServ', kind: 'notice', body: 'maintenance', ts: 1 }),
  ]);

  assert.doesNotMatch(queryMarkup, /aria-label="Open private message with MissD"/);
  assert.doesNotMatch(serverMarkup, /aria-label="Open private message with OperServ"/);
});

test('action rows keep the sender label and hide the duplicated nick in the body', () => {
  const markup = renderChatPane([
    makeMessage({ id: 'message-1', nick: 'cubanita', body: 'waves', kind: 'action', ts: 1 }),
  ]);

  assert.match(markup, />cubanita</);
  assert.match(markup, />waves</);
  assert.ok(!markup.includes('* cubanita'));
});

test('standalone notice rows with a sender render sender text without avatar markup', () => {
  const markup = renderChatPane([
    makeMessage({ id: 'message-1', nick: 'Nova', body: 'Heads up', kind: 'notice', ts: 1 }),
  ]);

  assert.match(markup, /Nova/);
  assert.match(markup, />Heads up</);
  assert.doesNotMatch(markup, /data-message-avatar=/);
});

test('system rows in channel transcripts use the compact inline timestamp layout', () => {
  const markup = renderChatPane([
    makeMessage({ id: 'message-1', nick: null, body: '* coco is logged in as coco', kind: 'system', ts: 1 }),
  ]);

  assert.match(markup, /grid items-start grid-cols-\[max-content_minmax\(0,1fr\)\] gap-x-2 gap-y-1 font-sans/);
  assert.match(markup, /<p class="min-w-0 break-words font-sans text-\[13px\] leading-5 text-inherit">/);
  assert.doesNotMatch(markup, /flex flex-wrap items-center gap-2 text-\[11px\] uppercase/);
});

test('server tab rows keep inline source labels instead of grouped headers', () => {
  const markup = renderServerPane([
    makeMessage({ id: 'message-1', nick: null, body: 'Connected', kind: 'system', ts: 1 }),
    makeMessage({ id: 'message-2', nick: null, body: 'Welcome', kind: 'system', ts: 2 }),
    makeMessage({ id: 'message-3', nick: null, body: 'Maintenance soon', kind: 'notice', ts: 3 }),
  ]);

  const serverLabels = markup.match(/>Server</g) ?? [];
  assert.equal(serverLabels.length, 2);
  assert.match(markup, />Notice</);
  assert.match(markup, /grid items-start grid-cols-\[max-content_minmax\(0,1fr\)\] gap-x-2 gap-y-1 font-sans/);
  assert.doesNotMatch(markup, /opacity-0 transition-opacity/);
  assert.doesNotMatch(markup, /text-\[15px\] font-semibold/);
  assert.doesNotMatch(markup, /flex min-w-0 flex-wrap items-baseline/);
  assert.match(markup, /<p class="min-w-0 break-words font-sans text-\[13px\] leading-5 text-inherit">/);
});

test('query transcripts show a load older control when earlier history is available', () => {
  const markup = renderQueryPane([
    makeMessage({ id: 'message-1', nick: 'MissD', target: 'MissD', body: 'latest', ts: 2 }),
  ], {
    canLoadOlderHistory: true,
  });

  assert.match(markup, /Load older/);
});

test('query transcripts show a loading state while older history is being fetched', () => {
  const markup = renderQueryPane([
    makeMessage({ id: 'message-1', nick: 'MissD', target: 'MissD', body: 'latest', ts: 2 }),
  ], {
    canLoadOlderHistory: true,
    loadingOlderHistory: true,
  });

  assert.match(markup, /Loading older\.\.\./);
  assert.match(markup, /disabled=""/);
});

test('query transcripts show a jump-to-latest pill when scrolled away from the live edge', () => {
  const markup = renderQueryPane([
    makeMessage({ id: 'message-1', nick: 'MissD', target: 'MissD', body: 'latest', ts: 2 }),
  ], {
    onJumpToLatest: () => undefined,
    scrollRef: {
      current: { clientHeight: 100, scrollHeight: 400, scrollTop: 180 } as HTMLDivElement,
    },
  });

  assert.match(markup, /Jump to latest/);
  assert.match(markup, /rounded-full/);
});

test('query transcripts hide the jump-to-latest pill while already near the bottom', () => {
  const markup = renderQueryPane([
    makeMessage({ id: 'message-1', nick: 'MissD', target: 'MissD', body: 'latest', ts: 2 }),
  ], {
    onJumpToLatest: () => undefined,
    scrollRef: {
      current: { clientHeight: 100, scrollHeight: 400, scrollTop: 276 } as HTMLDivElement,
    },
  });

  assert.doesNotMatch(markup, /Jump to latest/);
});

test('server transcripts do not render the load older control', () => {
  const markup = renderServerPane([
    makeMessage({ id: 'message-1', nick: null, body: 'Connected', kind: 'system', ts: 1 }),
  ]);

  assert.doesNotMatch(markup, /Load older/);
});
