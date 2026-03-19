import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIrcFormatting } from '../web/src/irc-format.js';

test('parses numeric colors and preserves the current background until cleared', () => {
  const runs = parseIrcFormatting(`plain \u000304,02red on blue \u000312light blue on blue\u0003 reset`);

  assert.deepEqual(runs, [
    {
      text: 'plain ',
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
      text: 'red on blue ',
      style: {
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false,
        monospace: false,
        reverse: false,
        foregroundColor: '#FF0000',
        backgroundColor: '#00007F',
      },
    },
    {
      text: 'light blue on blue',
      style: {
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false,
        monospace: false,
        reverse: false,
        foregroundColor: '#0000FC',
        backgroundColor: '#00007F',
      },
    },
    {
      text: ' reset',
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
  ]);
});

test('parses hex colors, reverse, and style toggles', () => {
  const runs = parseIrcFormatting(`\u0002bold\u001D italic\u001F under\u001E strike\u0011 mono\u0016 rev\u0004ffcc00,002244 hex\u000F plain`);

  assert.deepEqual(runs, [
    {
      text: 'bold',
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
    {
      text: ' italic',
      style: {
        bold: true,
        italic: true,
        underline: false,
        strikethrough: false,
        monospace: false,
        reverse: false,
        foregroundColor: null,
        backgroundColor: null,
      },
    },
    {
      text: ' under',
      style: {
        bold: true,
        italic: true,
        underline: true,
        strikethrough: false,
        monospace: false,
        reverse: false,
        foregroundColor: null,
        backgroundColor: null,
      },
    },
    {
      text: ' strike',
      style: {
        bold: true,
        italic: true,
        underline: true,
        strikethrough: true,
        monospace: false,
        reverse: false,
        foregroundColor: null,
        backgroundColor: null,
      },
    },
    {
      text: ' mono',
      style: {
        bold: true,
        italic: true,
        underline: true,
        strikethrough: true,
        monospace: true,
        reverse: false,
        foregroundColor: null,
        backgroundColor: null,
      },
    },
    {
      text: ' rev',
      style: {
        bold: true,
        italic: true,
        underline: true,
        strikethrough: true,
        monospace: true,
        reverse: true,
        foregroundColor: null,
        backgroundColor: null,
      },
    },
    {
      text: ' hex',
      style: {
        bold: true,
        italic: true,
        underline: true,
        strikethrough: true,
        monospace: true,
        reverse: true,
        foregroundColor: '#FFCC00',
        backgroundColor: '#002244',
      },
    },
    {
      text: ' plain',
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
  ]);
});
