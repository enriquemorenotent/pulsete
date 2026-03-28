import type { AssistantTaskKind, AssistantTurnAttachmentInput, ChatMessage } from '../shared/protocol.js';
import { buildAssistantHistoryContext, extractSearchTerms } from './assistant-history-context.js';
import {
  buildTranscriptChunks,
  renderHistoryIndex,
  renderTranscriptChunk,
  selectChunkIndexes,
} from './assistant-history-package-chunks.js';
import { buildFocusedAttachmentText, buildFocusedSlices } from './assistant-history-package-focus.js';

type AssistantHistoryPackageInput = {
  messages: ChatMessage[];
  prompt: string;
  task: AssistantTaskKind;
};

type AssistantHistoryPackage = {
  attachments: AssistantTurnAttachmentInput[];
  context: string;
};

export const buildAssistantHistoryPackage = ({
  messages,
  prompt,
  task,
}: AssistantHistoryPackageInput): AssistantHistoryPackage => {
  const context = buildAssistantHistoryContext({ messages, prompt, task });
  if (messages.length === 0 || context.includes('\n\nFull transcript:\n')) {
    return { attachments: [], context };
  }
  const searchTerms = extractSearchTerms(prompt);
  const chunks = buildTranscriptChunks(messages);
  const focusedSlices = buildFocusedSlices(messages, prompt, searchTerms);
  const selectedChunkIndexes = selectChunkIndexes(messages, chunks, focusedSlices, searchTerms);
  const focusedAttachmentText = buildFocusedAttachmentText(messages, prompt, searchTerms, focusedSlices);
  const attachments = [
    focusedAttachmentText ? toTextAttachment('history-query-focus.txt', focusedAttachmentText) : null,
    toTextAttachment('history-index.txt', renderHistoryIndex(messages, chunks, selectedChunkIndexes)),
    ...selectedChunkIndexes.map((chunkIndex) =>
      toTextAttachment(
        `history-transcript-${String(chunkIndex + 1).padStart(3, '0')}.txt`,
        renderTranscriptChunk(messages, chunks[chunkIndex]!),
      )
    ),
  ].filter((attachment): attachment is AssistantTurnAttachmentInput => attachment !== null);
  return {
    attachments,
    context: [
      context,
      '',
      'Additional history package:',
      '- The overview above is a guide built from the full buffer history.',
      focusedAttachmentText
        ? '- `history-query-focus.txt` contains exact excerpts pulled directly from the full stored transcript for this request.'
        : null,
      '- `history-index.txt` maps the entire transcript in chronological chunks.',
      selectedChunkIndexes.length === chunks.length
        ? '- The attached `history-transcript-*.txt` files contain the full raw transcript.'
        : '- The attached `history-transcript-*.txt` files are a budgeted raw-transcript subset chosen from the full history. Use the index and query-focus excerpts to reason about any gaps.',
    ].filter((line): line is string => Boolean(line)).join('\n'),
  };
};

const toTextAttachment = (name: string, text: string): AssistantTurnAttachmentInput => ({
  id: `history:${name}`,
  kind: 'text',
  name,
  mimeType: 'text/plain',
  size: Buffer.byteLength(text, 'utf8'),
  text,
});
