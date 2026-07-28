import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AiAssistantMarkdown } from '../web/src/AiAssistantMarkdown.js';

test('assistant markdown renders common formatting and GFM tables', () => {
  const markup = renderToStaticMarkup(
    <AiAssistantMarkdown>{[
      '# Result',
      'Use **bold text** and `inline code`.',
      '- First item\n- Second item',
      '| Name | Value |\n| --- | --- |\n| one | two |',
      '```ts\nconst answer = 42;\n```',
      '[Documentation](https://example.test/docs)',
    ].join('\n\n')}</AiAssistantMarkdown>,
  );

  assert.match(markup, /<h1[^>]*>Result<\/h1>/);
  assert.match(markup, /<strong>bold text<\/strong>/);
  assert.match(markup, /<code[^>]*>inline code<\/code>/);
  assert.match(markup, /<ul[^>]*>[\s\S]*First item[\s\S]*Second item[\s\S]*<\/ul>/);
  assert.match(markup, /<table[^>]*>[\s\S]*<th[^>]*>Name<\/th>[\s\S]*<td[^>]*>two<\/td>/);
  assert.match(markup, /<pre[^>]*>[\s\S]*const answer = 42;/);
  assert.match(markup, /href="https:\/\/example.test\/docs"/);
  assert.match(markup, /target="_blank"/);
  assert.match(markup, /rel="noopener noreferrer"/);
});

test('assistant markdown does not render raw HTML or remote images', () => {
  const markup = renderToStaticMarkup(
    <AiAssistantMarkdown>
      {'Before <script>alert("unsafe")</script> after\n\n![tracking](https://example.test/pixel.gif)'}
    </AiAssistantMarkdown>,
  );

  assert.doesNotMatch(markup, /<script/i);
  assert.doesNotMatch(markup, /<img/i);
  assert.doesNotMatch(markup, /src=/i);
  assert.match(markup, /\[Image: tracking\]/);
});
