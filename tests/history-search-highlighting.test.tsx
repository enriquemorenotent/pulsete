import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormattedMessageText } from '../web/src/FormattedMessageText.js';
import { highlightSearchText } from '../web/src/highlight-search-text.js';

test('search highlighting treats punctuation literally and escapes message HTML', () => {
  const markup = renderToStaticMarkup(<>{highlightSearchText('<script>C++ HELLO</script>', 'c++ hello')}</>);
  assert.match(markup, /<mark[^>]*>C\+\+<\/mark>/);
  assert.match(markup, /<mark[^>]*>HELLO<\/mark>/);
  assert.ok(!markup.includes('<script>'));
});

test('search highlighting preserves message links and IRC formatting', () => {
  const markup = renderToStaticMarkup(<FormattedMessageText
    text={'\u0002Hello\u0002 https://example.test/hello'}
    highlightQuery="hello"
    renderInlinePreviews={false}
    renderPagePreviewStatus={false}
    onOpenChannel={() => undefined}
  />);
  assert.match(markup, /font-weight:700/);
  assert.match(markup, /href="https:\/\/example.test\/hello"/);
  assert.equal((markup.match(/<mark /g) ?? []).length, 2);
});
