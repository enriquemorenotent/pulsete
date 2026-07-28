import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tokenizeFormattedMessage } from '../web/src/formatted-message.js';
import {
  FormattedMessageText,
  InlineImagePreviewDialogBody,
  InlineMediaPreviewDialogBody,
  parseFormattedMessageContent,
} from '../web/src/FormattedMessageText.js';
import { resolveInlineMediaHref } from '../web/src/formatted-message-inline-media.js';

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
  assert.match(html, /font-medium text-primary\/90 underline decoration-primary\/35/);
  assert.match(html, /style="color:hsl\(0 58% 66%\)"/);
  assert.match(html, /<button[^>]*>#?<span style="font-weight:700">#help<\/span><\/button>/);
  assert.ok(!html.includes('\u0003'));
  assert.ok(!html.includes('\u0002'));
});

test('renders IRC colors through a subdued dark-theme palette', () => {
  const html = renderToStaticMarkup(
    createElement(FormattedMessageText, {
      text: '\u000304,12red on blue \u0004ff00ff,00ff00hex color\u000F \u0016reverse',
      onOpenChannel() {},
    })
  );

  assert.match(
    html,
    /style="color:hsl\(0 58% 66%\);background-color:hsl\(240 36% 54% \/ 0\.18\)">red on blue/,
  );
  assert.match(
    html,
    /style="color:hsl\(300 58% 66%\);background-color:hsl\(120 36% 54% \/ 0\.18\)">hex color/,
  );
  assert.match(
    html,
    /style="color:var\(--transcript-message\);background-color:rgba\(255, 255, 255, 0\.12\)">reverse/,
  );
  assert.ok(!html.includes('#FF0000'));
  assert.ok(!html.includes('#FF00FF'));
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
  assert.ok(!html.includes('style="color:hsl(0 58% 66%)"'));
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

  assert.match(html, /<button[^>]*type="button"/);
  assert.match(html, /<img[^>]*src="https:\/\/cdn\.example\.com\/cat\.PNG\?size=full"/);
  assert.match(html, /alt="Inline image preview: cat\.PNG"/);
  assert.match(html, /Look/);
  assert.doesNotMatch(html, /href="https:\/\/cdn\.example\.com\/cat\.PNG\?size=full"/);
  assert.doesNotMatch(html, />https:\/\/cdn\.example\.com\/cat\.PNG\?size=full</);
});

test('renders inline previews when the image format is carried in query params', () => {
  const html = renderToStaticMarkup(
    createElement(FormattedMessageText, {
      text: 'Look https://pbs.twimg.com/media/HEWTgcrbIAAQ4Ta?format=jpg&name=large',
      onOpenChannel() {},
    })
  );

  assert.match(html, /<button[^>]*type="button"/);
  assert.match(html, /<img[^>]*src="https:\/\/pbs\.twimg\.com\/media\/HEWTgcrbIAAQ4Ta\?format=jpg&amp;name=large"/);
  assert.doesNotMatch(html, /href="https:\/\/pbs\.twimg\.com\/media\/HEWTgcrbIAAQ4Ta\?format=jpg&amp;name=large"/);
  assert.doesNotMatch(html, />https:\/\/pbs\.twimg\.com\/media\/HEWTgcrbIAAQ4Ta\?format=jpg&amp;name=large</);
});

test('renders inline previews for PNJ image links', () => {
  const extensionHtml = renderToStaticMarkup(
    createElement(FormattedMessageText, {
      text: 'Look https://cdn.example.com/cat.PNJ',
      onOpenChannel() {},
    })
  );
  const queryHtml = renderToStaticMarkup(
    createElement(FormattedMessageText, {
      text: 'Look https://cdn.example.com/image?id=cat&format=pnj',
      onOpenChannel() {},
    })
  );

  assert.match(extensionHtml, /<img[^>]*src="https:\/\/cdn\.example\.com\/cat\.PNJ"/);
  assert.match(queryHtml, /<img[^>]*src="https:\/\/cdn\.example\.com\/image\?id=cat&amp;format=pnj"/);
});

test('renders Imgur GIFV links as looping MP4 video previews', () => {
  const html = renderToStaticMarkup(
    createElement(FormattedMessageText, {
      text: 'Watch https://i.imgur.com/TEHJoGS.gifv',
      onOpenChannel() {},
    })
  );

  assert.match(html, /<video[^>]*src="https:\/\/i\.imgur\.com\/TEHJoGS\.mp4"/);
  assert.match(html, /<video[^>]*autoPlay=""/i);
  assert.match(html, /<video[^>]*loop=""/i);
  assert.match(html, /<video[^>]*muted=""/i);
  assert.match(html, /<video[^>]*playsInline=""/i);
  assert.match(html, /<video[^>]*preload="metadata"/i);
  assert.doesNotMatch(html, /href="https:\/\/i\.imgur\.com\/TEHJoGS\.gifv"/);
});

test('renders direct MP4 links as on-demand video players', () => {
  const href = 'https://cdn.example.com/media/clip.MP4?token=abc#t=2';
  const html = renderToStaticMarkup(
    createElement(FormattedMessageText, {
      text: `Watch ${href}`,
      onOpenChannel() {},
    })
  );

  assert.match(html, /<video[^>]*src="https:\/\/cdn\.example\.com\/media\/clip\.MP4\?token=abc#t=2"/);
  assert.match(html, /<video[^>]*controls=""/i);
  assert.match(html, /<video[^>]*muted=""/i);
  assert.match(html, /<video[^>]*playsInline=""/i);
  assert.match(html, /<video[^>]*preload="metadata"/i);
  assert.doesNotMatch(html, /<video[^>]*autoPlay=""/i);
  assert.doesNotMatch(html, /<video[^>]*loop=""/i);
  assert.match(html, /aria-label="Expand Inline video preview: clip\.MP4"/);
  assert.doesNotMatch(html, /href="https:\/\/cdn\.example\.com\/media\/clip\.MP4\?token=abc#t=2"/);
});

test('renders direct MOV links as on-demand video players', () => {
  const href = 'https://cdn.example.com/media/clip.MOV?token=abc#t=2';
  const html = renderToStaticMarkup(
    createElement(FormattedMessageText, {
      text: `Watch ${href}`,
      onOpenChannel() {},
    })
  );

  assert.match(html, /<video[^>]*src="https:\/\/cdn\.example\.com\/media\/clip\.MOV\?token=abc#t=2"/);
  assert.match(html, /<video[^>]*controls=""/i);
  assert.match(html, /<video[^>]*muted=""/i);
  assert.match(html, /<video[^>]*playsInline=""/i);
  assert.match(html, /<video[^>]*preload="metadata"/i);
  assert.doesNotMatch(html, /<video[^>]*autoPlay=""/i);
  assert.doesNotMatch(html, /<video[^>]*loop=""/i);
  assert.match(html, /aria-label="Expand Inline video preview: clip\.MOV"/);
  assert.doesNotMatch(html, /href="https:\/\/cdn\.example\.com\/media\/clip\.MOV\?token=abc#t=2"/);
});

test('resolves only direct MP4 and MOV paths as on-demand videos', () => {
  const href = 'https://cdn.example.com/media/clip.MP4?token=abc#t=2';
  const movHref = 'https://cdn.example.com/media/clip.MOV?token=abc#t=2';

  assert.deepEqual(resolveInlineMediaHref(href), {
    kind: 'video',
    mimeType: 'video/mp4',
    originalHref: href,
    playback: 'on-demand',
    sourceHref: href,
  });
  assert.deepEqual(resolveInlineMediaHref(movHref), {
    kind: 'video',
    mimeType: 'video/quicktime',
    originalHref: movHref,
    playback: 'on-demand',
    sourceHref: movHref,
  });
  assert.equal(resolveInlineMediaHref('https://cdn.example.com/media/clip.mp4/metadata'), null);
  assert.equal(resolveInlineMediaHref('https://cdn.example.com/media/clip.mov/metadata'), null);
  assert.equal(resolveInlineMediaHref('https://cdn.example.com/media/clip?format=mp4'), null);
  assert.equal(resolveInlineMediaHref('https://cdn.example.com/media/clip?format=mov'), null);
});

test('renders Tumblr GIFV links as negotiated image previews', () => {
  const href = 'https://64.media.tumblr.com/hash/revision/s400x600/clip.gifv';
  const html = renderToStaticMarkup(
    createElement(FormattedMessageText, {
      text: `Watch ${href}`,
      onOpenChannel() {},
    })
  );

  assert.match(html, /<img[^>]*src="https:\/\/64\.media\.tumblr\.com\/hash\/revision\/s400x600\/clip\.gifv"/);
  assert.match(html, /alt="Inline image preview: clip\.gifv"/);
  assert.doesNotMatch(html, /<video/);
  assert.doesNotMatch(html, /href="https:\/\/64\.media\.tumblr\.com\/hash\/revision\/s400x600\/clip\.gifv"/);
});

test('resolves only Tumblr media-host GIFV routes as negotiated images', () => {
  const href = 'https://64.media.tumblr.com/hash/revision/s1280x1920/clip.GIFV?download=1';

  assert.deepEqual(resolveInlineMediaHref(href), {
    kind: 'image',
    originalHref: href,
    sourceHref: href,
  });
  assert.equal(resolveInlineMediaHref('https://example.tumblr.com/clip.gifv'), null);
});

test('resolves only direct Imgur GIFV media URLs', () => {
  assert.deepEqual(
    resolveInlineMediaHref('https://imgur.com/aB123.GIFV?download=1#preview'),
    {
      kind: 'video',
      mimeType: 'video/mp4',
      originalHref: 'https://imgur.com/aB123.GIFV?download=1#preview',
      playback: 'looping-animation',
      sourceHref: 'https://imgur.com/aB123.mp4?download=1',
    },
  );
  assert.equal(resolveInlineMediaHref('https://cdn.example.com/aB123.gifv'), null);
  assert.equal(resolveInlineMediaHref('https://imgur.com/gallery/aB123.gifv'), null);
});

test('renders unrecognized GIFV URLs as ordinary links', () => {
  const html = renderToStaticMarkup(
    createElement(FormattedMessageText, {
      text: 'Watch https://cdn.example.com/clip.gifv',
      onOpenChannel() {},
    })
  );

  assert.match(html, /href="https:\/\/cdn\.example\.com\/clip\.gifv"/);
  assert.doesNotMatch(html, /<video/);
});

test('inline GIFV dialog plays video with controls and links to the original route', () => {
  const media = resolveInlineMediaHref('https://i.imgur.com/TEHJoGS.gifv');
  assert.ok(media);
  const html = renderToStaticMarkup(
    createElement(InlineMediaPreviewDialogBody, { media })
  );

  assert.match(html, /<video[^>]*src="https:\/\/i\.imgur\.com\/TEHJoGS\.mp4"/);
  assert.match(html, /<video[^>]*controls=""/i);
  assert.match(html, /href="https:\/\/i\.imgur\.com\/TEHJoGS\.gifv"/);
  assert.match(html, />Open original</);
});

test('inline MP4 dialog waits for playback and links to the original video', () => {
  const media = resolveInlineMediaHref('https://cdn.example.com/media/clip.mp4');
  assert.ok(media);
  const html = renderToStaticMarkup(
    createElement(InlineMediaPreviewDialogBody, { media })
  );

  assert.match(html, /<video[^>]*src="https:\/\/cdn\.example\.com\/media\/clip\.mp4"/);
  assert.match(html, /<video[^>]*controls=""/i);
  assert.match(html, /<video[^>]*muted=""/i);
  assert.doesNotMatch(html, /<video[^>]*autoPlay=""/i);
  assert.doesNotMatch(html, /<video[^>]*loop=""/i);
  assert.match(html, /href="https:\/\/cdn\.example\.com\/media\/clip\.mp4"/);
});

test('inline MOV dialog waits for playback and links to the original video', () => {
  const media = resolveInlineMediaHref('https://cdn.example.com/media/clip.mov');
  assert.ok(media);
  const html = renderToStaticMarkup(
    createElement(InlineMediaPreviewDialogBody, { media })
  );

  assert.match(html, /<video[^>]*src="https:\/\/cdn\.example\.com\/media\/clip\.mov"/);
  assert.match(html, /<video[^>]*controls=""/i);
  assert.match(html, /<video[^>]*muted=""/i);
  assert.doesNotMatch(html, /<video[^>]*autoPlay=""/i);
  assert.doesNotMatch(html, /<video[^>]*loop=""/i);
  assert.match(html, /href="https:\/\/cdn\.example\.com\/media\/clip\.mov"/);
});

test('inline image preview dialog exposes the full-size image and original link', () => {
  const html = renderToStaticMarkup(
    createElement(InlineImagePreviewDialogBody, {
      href: 'https://cdn.example.com/cat.PNG?size=full',
    })
  );

  assert.match(html, /Inline image preview: cat\.PNG/);
  assert.match(html, /<img[^>]*src="https:\/\/cdn\.example\.com\/cat\.PNG\?size=full"/);
  assert.match(html, /href="https:\/\/cdn\.example\.com\/cat\.PNG\?size=full"/);
  assert.match(html, />Open original</);
});

test('inline image preview dialog can render an avatar-specific caption', () => {
  const html = renderToStaticMarkup(
    createElement(InlineImagePreviewDialogBody, {
      altText: 'Avatar for MissD',
      href: 'https://static.irccloud-cdn.com/avatar-redirect/7',
    })
  );

  assert.match(html, /alt="Avatar for MissD"/);
  assert.match(html, />Avatar for MissD</);
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

test('can render inline image URLs as links when media previews are hidden', () => {
  const html = renderToStaticMarkup(
    createElement(FormattedMessageText, {
      text: 'Look https://cdn.example.com/cat.PNG?size=full',
      inlineImageRendering: 'link',
      onOpenChannel() {},
    })
  );

  assert.match(html, /Look/);
  assert.match(html, /href="https:\/\/cdn\.example\.com\/cat\.PNG\?size=full"/);
  assert.match(html, />https:\/\/cdn\.example\.com\/cat\.PNG\?size=full</);
  assert.doesNotMatch(html, /<img/);
});

test('can render GIFV URLs as links when media previews are hidden', () => {
  const html = renderToStaticMarkup(
    createElement(FormattedMessageText, {
      text: 'Watch https://i.imgur.com/TEHJoGS.gifv',
      inlineImageRendering: 'link',
      onOpenChannel() {},
    })
  );

  assert.match(html, /href="https:\/\/i\.imgur\.com\/TEHJoGS\.gifv"/);
  assert.doesNotMatch(html, /<video/);
});

test('can render MP4 URLs as links when media previews are hidden', () => {
  const html = renderToStaticMarkup(
    createElement(FormattedMessageText, {
      text: 'Watch https://cdn.example.com/media/clip.mp4',
      inlineImageRendering: 'link',
      onOpenChannel() {},
    })
  );

  assert.match(html, /href="https:\/\/cdn\.example\.com\/media\/clip\.mp4"/);
  assert.doesNotMatch(html, /<video/);
});

test('can render MOV URLs as links when media previews are hidden', () => {
  const html = renderToStaticMarkup(
    createElement(FormattedMessageText, {
      text: 'Watch https://cdn.example.com/media/clip.mov',
      inlineImageRendering: 'link',
      onOpenChannel() {},
    })
  );

  assert.match(html, /href="https:\/\/cdn\.example\.com\/media\/clip\.mov"/);
  assert.doesNotMatch(html, /<video/);
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
