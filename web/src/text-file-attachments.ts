export const textFileAttachmentLimitBytes = 4 * 1024 * 1024;

const supportedTextExtensions = [
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
];

const supportedTextMimeTypes = new Set([
  'application/javascript',
  'application/json',
  'application/ld+json',
  'application/sql',
  'application/x-ndjson',
  'application/xml',
]);

export const textFileInputAccept = supportedTextExtensions.join(',');

export type ReadTextFileResult = {
  name: string;
  mimeType: string;
  size: number;
  text: string;
};

type FileDropPayload = {
  files?: ArrayLike<File> | null;
  types?: ArrayLike<string> | readonly string[] | null;
};

export const readSupportedTextFile = async (file: File): Promise<ReadTextFileResult> => {
  if (!isSupportedTextFile(file)) {
    throw new Error(`${file.name} is not a supported text file.`);
  }
  if (file.size > textFileAttachmentLimitBytes) {
    throw new Error(`${file.name} exceeds the ${formatAttachmentBytes(textFileAttachmentLimitBytes)} text file limit.`);
  }
  return {
    name: file.name,
    mimeType: file.type || 'text/plain',
    size: file.size,
    text: await file.text(),
  };
};

export const formatAttachmentBytes = (bytes: number) => {
  if (bytes >= 1024 * 1024) {
    return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
};

export const hasDroppedFiles = (payload: FileDropPayload | null) => {
  if (!payload) {
    return false;
  }
  return Array.from(payload.types ?? []).includes('Files') || Array.from(payload.files ?? []).length > 0;
};

export const listDroppedFiles = (payload: FileDropPayload | null) =>
  hasDroppedFiles(payload) ? Array.from(payload?.files ?? []) : [];

const isSupportedTextFile = (file: File) =>
  file.type.startsWith('text/')
  || supportedTextMimeTypes.has(file.type)
  || supportedTextExtensions.includes(getFileExtension(file.name));

const getFileExtension = (fileName: string) => {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot === -1 ? '' : fileName.slice(lastDot).toLowerCase();
};
