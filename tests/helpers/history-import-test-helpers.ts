import type { BufferState, HistoryImportTextFile } from '../../shared/protocol.js';

export const queryBuffer: BufferState = {
  id: 'buffer-query',
  networkId: 'network-1',
  kind: 'query',
  target: 'MissD',
  unread: 0,
  priorityUnread: 0,
  lastReadTs: null,
  lastReadMessageId: null,
};

export const channelBuffer: BufferState = {
  id: 'buffer-channel',
  networkId: 'network-1',
  kind: 'channel',
  target: '#lesdomme',
  unread: 0,
  priorityUnread: 0,
  lastReadTs: null,
  lastReadMessageId: null,
};

const hexChatFixture = [
  '**** BEGIN LOGGING AT Wed Mar 11 02:57:34 2026',
  '',
  '[MissD has address MissD@here.comes.the.sun]',
  'Mär 11 02:57:36 <sofia>\tHere I am',
  'Mär 11 02:57:45 <MissD>\tyay',
  'Mär 11 03:02:47 *\tMissD pets the lesbian bitch',
  'Mär 11 03:08:01 *\t[sofia] End of WHOIS list.',
  'Mär 11 04:33:50 *\tMissD pets her pet',
  'Mär 11 04:34:20 *\tNotify: MissD is offline (CuffLink (sofia))',
  'Mär 11 04:34:20 *\tMissD has quit (Quit: Leaving)',
  'Mär 11 04:34:20 *\tDisconnected ()',
  '**** ENDING LOGGING AT Wed Mar 11 04:37:32 2026',
].join('\n');

export const readHexChatFixture = (name: string): HistoryImportTextFile => ({
  name,
  mimeType: 'text/plain',
  size: hexChatFixture.length,
  text: hexChatFixture,
});

export const makeLogFile = (text: string, name = 'sample.log'): HistoryImportTextFile => ({
  name,
  mimeType: 'text/plain',
  size: text.length,
  text,
});
