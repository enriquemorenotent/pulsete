import type {
  AssistantActiveBuffer,
  AssistantAskRetrievalMemory,
  ChatMessage,
} from '../../shared/protocol.js';

export const missD: AssistantActiveBuffer = {
  bufferId: 'buffer-1',
  networkId: 'network-1',
  target: 'MissD',
  title: 'MissD',
};

export const missProxima: AssistantActiveBuffer = {
  bufferId: 'buffer-2',
  networkId: 'network-1',
  target: 'MissProxima',
  title: 'MissProxima',
};

export const queryBuffers = [missD, missProxima];

export const buildPreviousLexicalRetrieval = (
  searchTerms: string[] = ['fantasy', 'meet'],
): AssistantAskRetrievalMemory => ({
  subject: missD,
  request: {
    operation: 'search_buffer',
    limit: 5,
    searchTerms,
  },
  stage: 'lexical_search',
  query: searchTerms.join(', '),
  confidence: 0.5,
  scoreSummary: 'hits=1',
  context: [
    'Retrieved transcript context for MissD:',
    'Operation: search_buffer(limit=5)',
    `Search terms: ${searchTerms.join(', ')}`,
    'Matching hits: 1',
  ].join('\n'),
  matchCount: 1,
  matchedMessageIds: ['message-1'],
  windowMessageIds: [['message-1', 'message-2']],
  evidenceMessageIds: ['message-1', 'message-2'],
});

export const buildLineMessage = ({
  id,
  nick,
  body,
  self,
  ts,
}: {
  id: string;
  nick: string;
  body: string;
  self: boolean;
  ts: number;
}): ChatMessage => ({
  id,
  networkId: 'network-1',
  target: 'MissD',
  nick,
  body,
  kind: 'line',
  self,
  ts,
});
