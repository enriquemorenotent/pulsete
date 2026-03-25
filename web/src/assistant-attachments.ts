import type {
  AssistantAttachmentMetadata,
  AssistantTurnAttachmentInput,
} from '../../shared/protocol.js';
import {
  formatAttachmentBytes,
  hasDroppedFiles,
  listDroppedFiles,
  readSupportedTextFile,
  textFileAttachmentLimitBytes,
  textFileInputAccept,
} from './text-file-attachments.js';

export const assistantAttachmentLimit = 3;
export const assistantMaxAttachmentBytes = 4 * 1024 * 1024;
export const assistantMaxImageBytes = assistantMaxAttachmentBytes;
export const assistantMaxTextBytes = textFileAttachmentLimitBytes;
export const assistantMaxTextChars = 24_000;
export const assistantFileInputAccept = [
  textFileInputAccept,
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

export const hasAssistantDroppedFiles = hasDroppedFiles;

export const listAssistantDroppedFiles = listDroppedFiles;

const prepareAssistantAttachment = async (file: File): Promise<AssistantTurnAttachmentInput> => {
  if (isSupportedImage(file)) {
    if (file.size > assistantMaxImageBytes) {
      throw new Error(`${file.name} exceeds the ${formatAttachmentBytes(assistantMaxImageBytes)} image limit.`);
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
  try {
    const textFile = await readSupportedTextFile(file);
    return {
      id: buildAttachmentId(),
      name: textFile.name,
      mimeType: textFile.mimeType,
      size: textFile.size,
      kind: 'text',
      text: truncateAttachmentText(textFile.text),
    };
  } catch (error) {
    if (error instanceof Error && error.message.endsWith('is not a supported text file.')) {
      throw new Error(`${file.name} is not a supported attachment type.`);
    }
    throw error;
  }
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

const isSupportedImage = (file: File) => supportedImageMimeTypes.has(file.type);

const buildAttachmentId = () =>
  globalThis.crypto?.randomUUID?.() ?? `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
