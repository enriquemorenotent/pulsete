import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import type {
  AiAssistantProviderStatus,
  AiAssistantSelection,
} from '../../shared/protocol-ai.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.js';
import {
  formatReasoningEffort,
  resolveAiAssistantSelection,
} from './ai-assistant-model-selection.js';

type AiAssistantModelControlsProps = {
  disabled: boolean;
  onSelectionChange: (selection: AiAssistantSelection) => void;
  savedSelection: AiAssistantSelection;
  status: AiAssistantProviderStatus;
};

export function AiAssistantModelControls(props: AiAssistantModelControlsProps) {
  const resolved = resolveAiAssistantSelection(props.status, props.savedSelection);
  if (!resolved.model || !resolved.selection.reasoningEffort) {
    return (
      <p role="status" className="shrink-0 rounded-md border border-amber-300/15 bg-amber-300/6 px-2.5 py-2 text-[11px] leading-4 text-amber-100/82">
        {resolved.notice ?? 'Assistant model information is unavailable.'}
      </p>
    );
  }

  const model = resolved.model;
  const reasoningEffort = resolved.selection.reasoningEffort;
  return (
    <section aria-label="Assistant model settings" className="shrink-0">
      <details className="group/settings">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md py-1.5 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">{model.label} · {formatReasoningEffort(reasoningEffort)}</span>
          <ChevronDown className="ml-auto size-3.5 shrink-0 transition-transform group-open/settings:rotate-180" aria-hidden />
        </summary>
      <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2 rounded-md border border-white/[0.07] bg-black/10 p-2.5 mt-1">
        <div className="min-w-0 space-y-1">
          <span id="assistant-model-label" className="block text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/68">
            Model
          </span>
          <Select
            value={model.id}
            disabled={props.disabled}
            onValueChange={(modelId) => {
              const nextModel = props.status.availableModels.find(({ id }) => id === modelId);
              if (nextModel) {
                props.onSelectionChange({
                  model: nextModel.id,
                  reasoningEffort: nextModel.defaultReasoningEffort,
                });
              }
            }}
          >
            <SelectTrigger
              aria-labelledby="assistant-model-label"
              size="sm"
              className="h-7 w-full min-w-0 border-white/[0.08] bg-white/[0.025] px-2 text-[11px] shadow-none"
            >
              <SelectValue>{model.label}</SelectValue>
            </SelectTrigger>
            <SelectContent align="start">
              {props.status.availableModels.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0 space-y-1">
          <span id="assistant-reasoning-label" className="block text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/68">
            Reasoning
          </span>
          <Select
            value={reasoningEffort}
            disabled={props.disabled}
            onValueChange={(nextEffort) => props.onSelectionChange({
              model: model.id,
              reasoningEffort: nextEffort,
            })}
          >
            <SelectTrigger
              aria-labelledby="assistant-reasoning-label"
              size="sm"
              className="h-7 w-full min-w-0 border-white/[0.08] bg-white/[0.025] px-2 text-[11px] shadow-none"
            >
              <SelectValue>{formatReasoningEffort(reasoningEffort)}</SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              {model.reasoningEfforts.map((effort) => (
                <SelectItem key={effort} value={effort}>
                  {formatReasoningEffort(effort)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      </details>
      {resolved.notice ? (
        <p role="status" className="text-[10px] leading-4 text-amber-200/78">
          {resolved.notice}
        </p>
      ) : null}
    </section>
  );
}
