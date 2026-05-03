import type { ServerMessage } from '../../shared/protocol-messages.js';
import type { ApplyServerMessages } from './app-actions-types.js';

type MutationResult = {
  messages?: readonly ServerMessage[];
};

type AppMutationExecutorOptions<TResult, TValue> = {
  request(): Promise<TResult>;
  failureValue: TValue;
  mapResult?(result: TResult): TValue;
  onSuccess?(result: TResult): void;
  successMessage?: string | null | ((result: TResult) => string | null);
  errorMessage: string;
  formatError?(error: unknown, fallback: string): string;
};

type AppMutationExecutorParams = {
  applyServerMessages: ApplyServerMessages;
  updateBanner: (kind: 'notice' | 'error', message: string) => void;
};

const readMutationMessages = (result: unknown): readonly ServerMessage[] => {
  if (!result || typeof result !== 'object' || !('messages' in result)) {
    return [];
  }
  const { messages } = result as MutationResult;
  return Array.isArray(messages) ? messages : [];
};

const toErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export const createAppMutationExecutor = ({
  applyServerMessages,
  updateBanner,
}: AppMutationExecutorParams) => async <TResult, TValue = TResult>({
  request,
  failureValue,
  mapResult,
  onSuccess,
  successMessage,
  errorMessage,
  formatError = toErrorMessage,
}: AppMutationExecutorOptions<TResult, TValue>): Promise<TValue> => {
  try {
    const result = await request();
    applyServerMessages(readMutationMessages(result));
    onSuccess?.(result);
    const notice = typeof successMessage === 'function' ? successMessage(result) : successMessage;
    if (notice) {
      updateBanner('notice', notice);
    }
    return mapResult ? mapResult(result) : (result as TValue);
  } catch (error) {
    updateBanner('error', formatError(error, errorMessage));
    return failureValue;
  }
};
