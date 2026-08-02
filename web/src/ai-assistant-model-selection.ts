import type {
  AiAssistantModelOption,
  AiAssistantProviderStatus,
  AiAssistantSelection,
} from '../../shared/protocol-ai.js';

export type ResolvedAiAssistantSelection = {
  model: AiAssistantModelOption | null;
  notice: string | null;
  selection: AiAssistantSelection;
};

export const resolveAiAssistantSelection = (
  status: AiAssistantProviderStatus | null,
  saved: AiAssistantSelection,
): ResolvedAiAssistantSelection => {
  const availableModels = status?.availableModels ?? [];
  const fallback = availableModels.find(({ id }) => id === status?.model)
    ?? availableModels[0]
    ?? null;
  if (!fallback) {
    return {
      model: null,
      notice: status?.modelsError ?? status?.selectionNotice ?? null,
      selection: { model: null, reasoningEffort: null },
    };
  }

  const notices: string[] = [];
  const savedModel = saved.model
    ? availableModels.find(({ id }) => id === saved.model) ?? null
    : null;
  const model = savedModel ?? fallback;
  if (saved.model && !savedModel) {
    notices.push(`Saved model unavailable. Using ${model.label}.`);
  }

  const reasoningEffort = saved.reasoningEffort
    && model.reasoningEfforts.includes(saved.reasoningEffort)
    ? saved.reasoningEffort
    : model.defaultReasoningEffort;
  if (saved.reasoningEffort && saved.reasoningEffort !== reasoningEffort) {
    notices.push(`Saved reasoning unavailable. Using ${formatReasoningEffort(reasoningEffort)}.`);
  }

  return {
    model,
    notice: notices.join(' ') || status?.selectionNotice || null,
    selection: {
      model: model.id,
      reasoningEffort,
    },
  };
};

export const formatAssistantModelLabel = (label: string) =>
  label.replace(/^GPT-\d+(?:\.\d+)+-/i, '');

export const formatReasoningEffort = (effort: string) => {
  if (effort === 'xhigh') {
    return 'Extra high';
  }
  return effort.charAt(0).toUpperCase() + effort.slice(1);
};
