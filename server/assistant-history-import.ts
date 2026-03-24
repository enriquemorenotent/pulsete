import { z } from 'zod';
import type { AssistantAttachmentMetadata, BufferState, NetworkProfile } from '../shared/protocol.js';

export const assistantHistoryImportOutputSchema = {
  type: 'object',
  properties: {
    messages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ts: { type: 'integer' },
          nick: { type: ['string', 'null'] },
          body: { type: 'string' },
          self: { type: 'boolean' },
        },
        required: ['ts', 'nick', 'body', 'self'],
        additionalProperties: false,
      },
    },
    notes: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['messages', 'notes'],
  additionalProperties: false,
} as const;

const assistantHistoryImportResultSchema = z.object({
  messages: z.array(z.object({
    ts: z.number().int().nonnegative(),
    nick: z.string().nullable(),
    body: z.string().trim().min(1),
    self: z.boolean(),
  })),
  notes: z.array(z.string()).default([]),
});

export type AssistantHistoryImportResult = z.infer<typeof assistantHistoryImportResultSchema>;

export const buildAssistantHistoryImportInput = ({
  attachments,
  buffer,
  network,
  prompt,
}: {
  attachments: AssistantAttachmentMetadata[];
  buffer: BufferState;
  network: NetworkProfile | null;
  prompt: string;
}) => [
  'Task: Parse the attached text logs and extract real chat messages for the current IRC buffer.',
  `Network: ${network?.name ?? 'None'}`,
  `Current nick: ${network?.nick ?? 'Unknown'}`,
  `Buffer kind: ${buffer.kind}`,
  `Buffer target: ${buffer.target}`,
  'Rules:',
  '- Use only the attached text files.',
  '- Extract only real chat lines that belong in this single buffer history.',
  '- Skip joins, parts, topics, separators, timestamps-only lines, and unrelated conversations.',
  '- Return messages ordered from oldest to newest.',
  '- Convert timestamps to Unix milliseconds.',
  '- Set self=true only for lines written by the local user.',
  '- Keep body text clean and do not include nick prefixes in body.',
  '- If you are unsure about a line, omit it instead of inventing data.',
  attachments.length > 0
    ? `Attached files:\n${attachments.map(renderAttachmentLabel).join('\n')}`
    : '',
  `User hints:\n${prompt.trim() || 'Import the attached logs into this buffer history.'}`,
].filter((section) => section.trim()).join('\n\n');

export const parseAssistantHistoryImportResult = (text: string) =>
  assistantHistoryImportResultSchema.parse(JSON.parse(text));

export const buildAssistantHistoryImportSummary = ({
  attachments,
  importedCount,
  notes,
  target,
}: {
  attachments: AssistantAttachmentMetadata[];
  importedCount: number;
  notes: string[];
  target: string;
}) => {
  const files = attachments.map((attachment) => attachment.name).join(', ');
  if (importedCount === 0) {
    return notes.length > 0
      ? `No messages were imported into ${target}. ${notes.join(' ')}`
      : `No messages were imported into ${target}.`;
  }
  const noteSuffix = notes.length > 0 ? ` Notes: ${notes.join(' ')}` : '';
  return `Imported ${importedCount} messages from ${files} into ${target}.${noteSuffix}`;
};

const renderAttachmentLabel = (attachment: AssistantAttachmentMetadata) =>
  `- ${attachment.name} (${attachment.mimeType}, ${attachment.size} bytes)`;
