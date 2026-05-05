import { historySearchLimit } from '../shared/protocol-chat.js';

export const normalizeHistorySearchQuery = (value: string | null) => value?.trim() ?? '';

export const normalizeHistorySearchLimit = (value: string | null) => {
  const limit = Number(value ?? historySearchLimit);
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, historySearchLimit) : historySearchLimit;
};

export const normalizeOptionalSearchFilter = (value: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};
