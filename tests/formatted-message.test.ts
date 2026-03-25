import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tokenizeFormattedMessage } from '../web/src/formatted-message.js';
import { FormattedMessageText, parseFormattedMessageContent } from '../web/src/FormattedMessageText.js';

test('keeps links clickable across IRC style changes', () => {
  const tokens = tokenizeFormattedMessage('Docs: https://exa\u0002mple.com now');

  assert.deepEqual(tokens, [
    {
      type: 'text',
      parts: [
        {
          text: 'Docs: ',
          style: {
            bold: false,
            italic: false,
            underline: false,
            strikethrough: false,
            monospace: false,
            reverse: false,
            foregroundColor: null,
            backgroundColor: null,
          },
        },
      ],
    },
    {
      type: 'link',
      href: 'https://example.com',
      external: true,
      parts: [
        {
          text: 'https://exa',
          style: {
            bold: false,
            italic: false,
            underline: false,
            strikethrough: false,
            monospace: false,
            reverse: false,
            foregroundColor: null,
            backgroundColor: null,
          },
        },
        {
          text: 'mple.com',
          style: {
            bold: true,
            italic: false,
            underline: false,
            strikethrough: false,
            monospace: false,
            reverse: false,
            foregroundColor: null,
            backgroundColor: null,
          },
        },
      ],
    },
    {
      type: 'text',
      parts: [
        {
          text: ' now',
          style: {
            bold: true,
            italic: false,
            underline: false,
            strikethrough: false,
            monospace: false,
            reverse: false,
            foregroundColor: null,
            backgroundColor: null,
          },
        },
      ],
    },
  ]);
});

test('renders styled links and channel mentions without control-code junk', () => {
  const html = renderToStaticMarkup(
    createElement(FormattedMessageText, {
      text: 'See \u000304www.example.com\u000F and [\u0002#help\u0002]',
      onOpenChannel() {},
    })
  );

  assert.match(html, /href="https:\/\/www\.example\.com"/);
  assert.match(html, /style="color:#FF0000"/);
  assert.match(html, /<button[^>]*>#?<span style="font-weight:700">#help<\/span><\/button>/);
  assert.ok(!html.includes('\u0003'));
  assert.ok(!html.includes('\u0002'));
});

test('renders stripped mode as plain visible text while keeping links clickable', () => {
  const html = renderToStaticMarkup(
    createElement(FormattedMessageText, {
      text: 'See \u000304www.example.com\u000F and #help',
      mode: 'stripped',
      onOpenChannel() {},
    })
  );

  assert.match(html, /href="https:\/\/www\.example\.com"/);
  assert.match(html, /<button[^>]*>#help<\/button>/);
  assert.ok(!html.includes('style="color:#FF0000"'));
  assert.ok(!html.includes('\u0003'));
  assert.ok(!html.includes('\u000F'));
});

test('renders inline previews for direct image links', () => {
  const html = renderToStaticMarkup(
    createElement(FormattedMessageText, {
      text: 'Look https://cdn.example.com/cat.PNG?size=full',
      onOpenChannel() {},
    })
  );

  assert.match(html, /href="https:\/\/cdn\.example\.com\/cat\.PNG\?size=full"/);
  assert.match(html, /<img[^>]*src="https:\/\/cdn\.example\.com\/cat\.PNG\?size=full"/);
  assert.match(html, /alt="Inline image preview: cat\.PNG"/);
  assert.match(html, /Look/);
  assert.doesNotMatch(html, />https:\/\/cdn\.example\.com\/cat\.PNG\?size=full</);
});

test('does not render inline previews for non-image links or raw mode', () => {
  const normalHtml = renderToStaticMarkup(
    createElement(FormattedMessageText, {
      text: 'Docs https://example.com/guide',
      onOpenChannel() {},
    })
  );
  const rawHtml = renderToStaticMarkup(
    createElement(FormattedMessageText, {
      text: 'Image https://cdn.example.com/cat.png',
      mode: 'raw',
      onOpenChannel() {},
    })
  );

  assert.doesNotMatch(normalHtml, /<img/);
  assert.doesNotMatch(rawHtml, /<img/);
});

test('can suppress inline previews when a parent renderer places them separately', () => {
  const parsedContent = parseFormattedMessageContent('Look https://cdn.example.com/cat.PNG?size=full', 'colors');
  const html = renderToStaticMarkup(
    createElement(FormattedMessageText, {
      text: 'Look https://cdn.example.com/cat.PNG?size=full',
      parsedContent,
      renderInlinePreviews: false,
      onOpenChannel() {},
    })
  );

  assert.match(html, /Look/);
  assert.doesNotMatch(html, /<img/);
});

test('renders raw mode with visible escape sequences instead of hidden control characters', () => {
  const html = renderToStaticMarkup(
    createElement(FormattedMessageText, {
      text: 'See \u000304www.example.com\u000F and [\u0002#help\u0002]',
      mode: 'raw',
      onOpenChannel() {},
    })
  );

  assert.match(html, /See \\x0304www\.example\.com\\x0F and \[\\x02#help\\x02\]/);
  assert.ok(!html.includes('href='));
  assert.ok(!html.includes('<button'));
  assert.ok(!html.includes('\u0003'));
  assert.ok(!html.includes('\u0002'));
});
