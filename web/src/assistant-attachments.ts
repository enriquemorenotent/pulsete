import type {
  AssistantAttachmentMetadata,
  AssistantTurnAttachmentInput,
} from '../../shared/protocol.js';

export const assistantAttachmentLimit = 3;
export const assistantMaxAttachmentBytes = 4 * 1024 * 1024;
export const assistantMaxImageBytes = assistantMaxAttachmentBytes;
export const assistantMaxTextBytes = assistantMaxAttachmentBytes;
export const assistantMaxTextChars = 24_000;
export const assistantFileInputAccept = [
  '.c',
  '.cc',
  '.conf',
  '.config',
  '.cpp',
  '.css',
  '.csv',
  '.env',
  '.go',
  '.html',
  '.ini',
  '.java',
  '.js',
  '.json',
  '.jsonl',
  '.jsx',
  '.log',
  '.md',
  '.mjs',
  '.ndjson',
  '.py',
  '.rb',
  '.rs',
  '.sh',
  '.sql',
  '.text',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
].join(',');

const supportedImageMimeTypes = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const supportedTextExtensions = new Set([
  '.c',
  '.cc',
  '.conf',
  '.config',
  '.cpp',
  '.css',
  '.csv',
  '.env',
  '.go',
  '.html',
  '.ini',
  '.java',
  '.js',
  '.json',
  '.jsonl',
  '.jsx',
  '.log',
  '.md',
  '.mjs',
  '.ndjson',
  '.py',
  '.rb',
  '.rs',
  '.sh',
  '.sql',
  '.text',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
]);

const supportedTextMimeTypes = new Set([
  'application/javascript',
  'application/json',
  'application/ld+json',
  'application/sql',
  'application/x-ndjson',
  'application/xml',
]);

export const toAttachmentMetadata = (
  attachment: AssistantTurnAttachmentInput
): AssistantAttachmentMetadata => ({
  id: attachment.id,
  name: attachment.name,
  mimeType: attachment.mimeType,
  size: attachment.size,
  kind: attachment.kind,
});

export const prepareAssistantAttachments = async (
  files: File[],
  existingCount = 0,
): Promise<AssistantTurnAttachmentInput[]> => {
  if (existingCount + files.length > assistantAttachmentLimit) {
    throw new Error(`Attach up to ${assistantAttachmentLimit} files per question.`);
  }
  return Promise.all(files.map((file) => prepareAssistantAttachment(file)));
};

type AssistantDropPayload = {
  files?: ArrayLike<File> | null;
  types?: ArrayLike<string> | readonly string[] | null;
};

export const hasAssistantDroppedFiles = (payload: AssistantDropPayload | null) => {
  if (!payload) {
    return false;
  }
  return Array.from(payload.types ?? []).includes('Files') || Array.from(payload.files ?? []).length > 0;
};

export const listAssistantDroppedFiles = (payload: AssistantDropPayload | null) =>
  hasAssistantDroppedFiles(payload) ? Array.from(payload?.files ?? []) : [];

const prepareAssistantAttachment = async (file: File): Promise<AssistantTurnAttachmentInput> => {
  if (isSupportedImage(file)) {
    if (file.size > assistantMaxImageBytes) {
      throw new Error(`${file.name} exceeds the ${formatBytes(assistantMaxImageBytes)} image limit.`);
    }
    return {
      id: buildAttachmentId(),
      name: file.name,
      mimeType: file.type,
      size: file.size,
      kind: 'image',
      dataUrl: await readFileAsDataUrl(file),
    };
  }
  if (isSupportedText(file)) {
    if (file.size > assistantMaxTextBytes) {
      throw new Error(`${file.name} exceeds the ${formatBytes(assistantMaxTextBytes)} text file limit.`);
    }
    return {
      id: buildAttachmentId(),
      name: file.name,
      mimeType: normalizeTextMimeType(file),
      size: file.size,
      kind: 'text',
      text: truncateAttachmentText(await file.text()),
    };
  }
  throw new Error(`${file.name} is not a supported attachment type.`);
};

const truncateAttachmentText = (text: string) => {
  if (text.length <= assistantMaxTextChars) {
    return text;
  }
  const headLength = Math.ceil(assistantMaxTextChars / 2);
  const tailLength = Math.floor(assistantMaxTextChars / 2);
  return [
    text.slice(0, headLength).trimEnd(),
    '',
    '[Truncated. Showing the start and end of the file.]',
    '',
    text.slice(-tailLength).trimStart(),
  ].join('\n');
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error(`Failed to read ${file.name}.`));
    });
    reader.addEventListener('error', () => {
      reject(new Error(`Failed to read ${file.name}.`));
    });
    reader.readAsDataURL(file);
  });

const normalizeTextMimeType = (file: File) => file.type || 'text/plain';

const isSupportedImage = (file: File) => supportedImageMimeTypes.has(file.type);

const isSupportedText = (file: File) =>
  file.type.startsWith('text/')
  || supportedTextMimeTypes.has(file.type)
  || supportedTextExtensions.has(getFileExtension(file.name));

const getFileExtension = (fileName: string) => {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot === -1 ? '' : fileName.slice(lastDot).toLowerCase();
};

const formatBytes = (bytes: number) => {
  if (bytes >= 1024 * 1024) {
    return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
};

const buildAttachmentId = () =>
  globalThis.crypto?.randomUUID?.() ?? `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
