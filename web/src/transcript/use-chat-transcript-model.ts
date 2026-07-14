import { useEffect, useMemo, useRef } from 'react';
import {
  deriveChatTranscriptModel,
  type ChatTranscriptDerivation,
} from './model-derivation.js';
import type { BuildChatTranscriptModelInput } from './model.js';

export const useChatTranscriptModel = (
  input: BuildChatTranscriptModelInput,
) => {
  const previousRef = useRef<ChatTranscriptDerivation | null>(null);
  const derivation = useMemo(
    () => deriveChatTranscriptModel(input, previousRef.current),
    [input],
  );
  useEffect(() => {
    previousRef.current = derivation;
  }, [derivation]);
  return derivation.model;
};
