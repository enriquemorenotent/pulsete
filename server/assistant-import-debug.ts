import type { AssistantAttachmentMetadata } from '../shared/protocol.js';

const importDeltaCharLogInterval = 2_000;
const importDeltaTimeLogIntervalMs = 5_000;
const importPreviewLimit = 240;

type ImportDeltaState = {
  chars: number;
  lastLoggedAt: number;
  lastLoggedChars: number;
  startedAt: number;
};

type ImportLogContext = {
  executionThreadId: string;
  target: string | null;
  threadId: string;
  turnId?: string;
};

const resolveAssistantImportDebugEnabled = () => {
  const explicit = process.env.PULSETE_ASSISTANT_IMPORT_DEBUG;
  if (explicit === '1') {
    return true;
  }
  if (explicit === '0') {
    return false;
  }
  return process.argv.includes('watch') && !process.argv.includes('--test');
};

const summarizeAttachments = (attachments: AssistantAttachmentMetadata[]) =>
  attachments.map((attachment) => ({
    kind: attachment.kind,
    mimeType: attachment.mimeType,
    name: attachment.name,
    size: attachment.size,
  }));

const previewText = (text: string, limit = importPreviewLimit) => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit).trimEnd()}...`;
};

export class AssistantImportDebugLogger {
  private readonly deltaByExecution = new Map<string, ImportDeltaState>();

  constructor(private readonly enabled = resolveAssistantImportDebugEnabled()) {}

  requestAccepted(input: ImportLogContext & {
    attachments: AssistantAttachmentMetadata[];
    bufferId: string | null;
    prompt: string;
  }) {
    this.log('request.accepted', {
      attachments: summarizeAttachments(input.attachments),
      bufferId: input.bufferId,
      executionThreadId: input.executionThreadId,
      prompt: previewText(input.prompt),
      target: input.target,
      threadId: input.threadId,
    });
  }

  executionThreadCreated(input: ImportLogContext) {
    this.deltaByExecution.set(input.executionThreadId, {
      chars: 0,
      lastLoggedAt: 0,
      lastLoggedChars: 0,
      startedAt: Date.now(),
    });
    this.log('execution.thread.created', input);
  }

  turnStartDispatched(input: ImportLogContext & {
    attachmentTextChars: number;
    inputItemCount: number;
  }) {
    this.log('turn.start.dispatched', input);
  }

  turnStartAcknowledged(input: ImportLogContext) {
    this.log('turn.start.acknowledged', input);
  }

  turnStartFailed(input: ImportLogContext & { error: string }) {
    this.log('turn.start.failed', input);
  }

  turnStarted(input: ImportLogContext) {
    this.log('turn.started', input);
  }

  interruptRequested(input: ImportLogContext & { state: 'live' | 'pending' }) {
    this.log('interrupt.requested', input);
  }

  itemStarted(input: ImportLogContext & { itemId: string; itemType: string; phase: string | null }) {
    this.log('item.started', input);
  }

  itemDelta(input: ImportLogContext & { deltaChars: number; itemId: string }) {
    if (!this.enabled) {
      return;
    }
    const state = this.deltaByExecution.get(input.executionThreadId) ?? {
      chars: 0,
      lastLoggedAt: 0,
      lastLoggedChars: 0,
      startedAt: Date.now(),
    };
    state.chars += input.deltaChars;
    const now = Date.now();
    const shouldLog = state.lastLoggedAt === 0
      || state.chars - state.lastLoggedChars >= importDeltaCharLogInterval
      || now - state.lastLoggedAt >= importDeltaTimeLogIntervalMs;
    if (!shouldLog) {
      this.deltaByExecution.set(input.executionThreadId, state);
      return;
    }
    state.lastLoggedAt = now;
    state.lastLoggedChars = state.chars;
    this.deltaByExecution.set(input.executionThreadId, state);
    this.log('item.delta', {
      ...input,
      elapsedMs: now - state.startedAt,
      totalChars: state.chars,
    });
  }

  itemCompleted(input: ImportLogContext & {
    itemId: string;
    itemType: string;
    phase: string | null;
    textChars: number | null;
  }) {
    this.log('item.completed', input);
  }

  parseSucceeded(input: ImportLogContext & {
    importedCount: number;
    noteCount: number;
  }) {
    this.log('parse.succeeded', input);
  }

  parseFailed(input: ImportLogContext & {
    error: string;
    responsePreview: string;
  }) {
    this.log('parse.failed', {
      ...input,
      responsePreview: previewText(input.responsePreview),
    });
  }

  turnCompleted(input: ImportLogContext & {
    error: string | null;
    status: string;
  }) {
    this.log('turn.completed', input);
  }

  serviceUnavailable(input: ImportLogContext & { error: string | null }) {
    this.log('service.unavailable', input);
  }

  clear(executionThreadId: string) {
    this.deltaByExecution.delete(executionThreadId);
  }

  private log(event: string, payload: Record<string, unknown>) {
    if (!this.enabled) {
      return;
    }
    console.log(`[assistant import] ${event} ${JSON.stringify(payload)}`);
  }
}
