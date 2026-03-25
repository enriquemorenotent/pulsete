import type { HistoryImportTextFile } from '../../shared/protocol.js';
import { historyImportFileLimit } from '../../shared/protocol.js';
import {
  readSupportedTextFile,
  textFileInputAccept,
} from './text-file-attachments.js';

export const historyImportFileInputAccept = textFileInputAccept;

export const prepareHistoryImportFiles = async (
  files: File[],
  existingCount = 0,
): Promise<HistoryImportTextFile[]> => {
  if (existingCount + files.length > historyImportFileLimit) {
    throw new Error(`Attach up to ${historyImportFileLimit} log files per import.`);
  }
  return Promise.all(files.map((file) => prepareHistoryImportFile(file)));
};

const prepareHistoryImportFile = async (file: File): Promise<HistoryImportTextFile> => {
  try {
    return await readSupportedTextFile(file);
  } catch (error) {
    if (error instanceof Error && error.message.endsWith('is not a supported text file.')) {
      throw new Error(`${file.name} is not a supported text log file.`);
    }
    throw error;
  }
};
