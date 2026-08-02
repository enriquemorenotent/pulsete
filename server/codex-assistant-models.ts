import { z } from 'zod';
import type {
  AiAssistantModelOption,
  AiAssistantSelection,
} from '../shared/protocol-ai.js';
import { runCommand } from './codex-command-runner.js';

const codexModelSchema = z.object({
  default_reasoning_level: z.string().trim().min(1).max(100).nullable().optional(),
  display_name: z.string().trim().min(1).max(200),
  priority: z.number().finite().optional(),
  slug: z.string().trim().min(1).max(100),
  supported_reasoning_levels: z.array(z.object({
    effort: z.string().trim().min(1).max(100),
  })).max(20).default([]),
  visibility: z.string().optional(),
});

const codexModelsResponseSchema = z.object({
  models: z.array(codexModelSchema).max(100),
});

export type CodexAssistantModelCatalog = {
  error: string | null;
  models: AiAssistantModelOption[];
};

export type ResolvedCodexAssistantSelection = {
  model: string | null;
  notice: string | null;
  reasoningEffort: string | null;
};

export const readCodexAssistantModelCatalog = async (
  command: string,
): Promise<CodexAssistantModelCatalog> => {
  const result = await runCommand(command, ['debug', 'models'], { timeoutMs: 10_000 });
  if (result.error?.code === 'ENOENT') {
    return unavailableCatalog('Install Codex CLI to choose an Assistant model.');
  }
  if (result.code !== 0) {
    return unavailableCatalog('Codex model information could not be loaded.');
  }
  try {
    const parsed = codexModelsResponseSchema.parse(JSON.parse(result.stdout));
    const visible = parsed.models
      .filter((model) => model.visibility === 'list')
      .sort((left, right) => (left.priority ?? 1_000) - (right.priority ?? 1_000));
    const currentFamily = findCurrentModelFamily(visible.map(({ slug }) => slug));
    const currentModels = currentFamily
      ? visible.filter(({ slug }) => slug === currentFamily || slug.startsWith(`${currentFamily}-`))
      : visible;
    const models = currentModels.flatMap(toModelOption);
    return models.length > 0
      ? { error: null, models }
      : unavailableCatalog('Codex did not report any selectable Assistant models.');
  } catch {
    return unavailableCatalog('Codex returned invalid model information.');
  }
};

export const resolveCodexAssistantSelection = (
  models: readonly AiAssistantModelOption[],
  configuredModel: string | null,
  requested: AiAssistantSelection = { model: null, reasoningEffort: null },
): ResolvedCodexAssistantSelection => {
  const configured = models.find(({ id }) => id === configuredModel) ?? null;
  const fallback = configured ?? models[0] ?? null;
  if (!fallback) {
    return {
      model: configuredModel,
      notice: requested.model || requested.reasoningEffort
        ? 'The saved Assistant choice could not be checked. Using the configured Codex default.'
        : null,
      reasoningEffort: null,
    };
  }

  const notices: string[] = [];
  const requestedModel = requested.model
    ? models.find(({ id }) => id === requested.model) ?? null
    : null;
  const model = requestedModel ?? fallback;
  if (requested.model && !requestedModel) {
    notices.push(`The saved model ${requested.model} is unavailable. Using ${model.label}.`);
  } else if (!requested.model && configuredModel && !configured) {
    notices.push(`The configured model ${configuredModel} is unavailable. Using ${model.label}.`);
  }

  const requestedEffort = requested.reasoningEffort;
  const reasoningEffort = requestedEffort && model.reasoningEfforts.includes(requestedEffort)
    ? requestedEffort
    : model.defaultReasoningEffort;
  if (requestedEffort && requestedEffort !== reasoningEffort) {
    notices.push(
      `The saved reasoning effort ${requestedEffort} is unavailable for ${model.label}. Using ${reasoningEffort}.`,
    );
  }

  return {
    model: model.id,
    notice: notices.join(' ') || null,
    reasoningEffort,
  };
};

const findCurrentModelFamily = (slugs: readonly string[]) => {
  for (const slug of slugs) {
    const match = /^(gpt-\d+(?:\.\d+)+)(?:-|$)/.exec(slug);
    if (match) {
      return match[1];
    }
  }
  return null;
};

const toModelOption = (
  model: z.infer<typeof codexModelSchema>,
): AiAssistantModelOption[] => {
  const reasoningEfforts = [...new Set(
    model.supported_reasoning_levels.map(({ effort }) => effort),
  )];
  if (reasoningEfforts.length === 0) {
    return [];
  }
  const defaultReasoningEffort = model.default_reasoning_level
    && reasoningEfforts.includes(model.default_reasoning_level)
    ? model.default_reasoning_level
    : reasoningEfforts[0];
  return [{
    defaultReasoningEffort,
    id: model.slug,
    label: model.display_name,
    reasoningEfforts,
  }];
};

const unavailableCatalog = (error: string): CodexAssistantModelCatalog => ({
  error,
  models: [],
});
