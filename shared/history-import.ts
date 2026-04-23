import { z } from 'zod';

export const historyImportFileLimit = 3;
export const historyImportMaxFileBytes = 4 * 1024 * 1024;
export const historyImportRequestBodyLimitBytes = 20 * 1024 * 1024;
export const historyImportSelfNickLimit = 12;

export const selfNickAliasesSchema = z.array(z.string().trim().min(1, 'Nick names cannot be empty'))
  .max(historyImportSelfNickLimit, `Add at most ${historyImportSelfNickLimit} self nick aliases`)
  .default([]);

export const historyImportFormatSchema = z.enum(['hexchat', 'pulsete']);
export type HistoryImportFormat = z.infer<typeof historyImportFormatSchema>;

export const historyImportTextFileSchema = z.object({
  name: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
  size: z.number().int().nonnegative().max(historyImportMaxFileBytes),
  text: z.string(),
});
export type HistoryImportTextFile = z.infer<typeof historyImportTextFileSchema>;

export const bufferHistoryImportRequestSchema = z.object({
  files: z.array(historyImportTextFileSchema)
    .min(1, 'Attach at least one text log file to import')
    .max(historyImportFileLimit),
  selfNicks: selfNickAliasesSchema,
});
export type BufferHistoryImportRequest = z.infer<typeof bufferHistoryImportRequestSchema>;

export const bufferSelfNickAliasesRequestSchema = z.object({
  selfNickAliases: selfNickAliasesSchema,
});
export type BufferSelfNickAliasesRequest = z.infer<typeof bufferSelfNickAliasesRequestSchema>;

export const bufferHistoryImportSummarySchema = z.object({
  format: historyImportFormatSchema,
  importedCount: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
});
export type BufferHistoryImportSummary = z.infer<typeof bufferHistoryImportSummarySchema>;
