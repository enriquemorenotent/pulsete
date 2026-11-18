import { ChevronDown } from 'lucide-react';
import { Popover } from 'radix-ui';
import { Button } from '@/components/ui/button.js';
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
      <p role="status" className="px-1.5 text-[11px] leading-4 text-amber-100/82">
        {resolved.notice ?? 'Assistant model information is unavailable.'}
      </p>
    );
  }

  const model = resolved.model;
  const reasoningEffort = resolved.selection.reasoningEffort;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button type="button" variant="ghost" size="sm" disabled={props.disabled}
          className="h-8 max-w-full gap-1.5 px-1.5 text-xs font-normal text-muted-foreground hover:text-foreground"
          aria-label={`Choose assistant model, ${model.label}, ${formatReasoningEffort(reasoningEffort)} reasoning`}>
          <span className="min-w-0 truncate">{model.label} · {formatReasoningEffort(reasoningEffort)}</span>
          <ChevronDown className="size-3.5 shrink-0" aria-hidden />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content aria-label="Assistant model settings" side="top" align="start" sideOffset={12}
          className="z-50 w-56 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg outline-none">
          <div className="grid gap-2.5">
            <div className="min-w-0 space-y-1">
              <span className="block text-xs font-medium text-muted-foreground">
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
                  aria-label="Model"
                  size="sm"
                  className="w-full min-w-0 border-white/10 bg-white/[0.025] px-2.5 text-xs shadow-none *:data-[slot=select-value]:block *:data-[slot=select-value]:truncate"
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
              <span className="block text-xs font-medium text-muted-foreground">
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
                  aria-label="Reasoning"
                  size="sm"
                  className="w-full min-w-0 border-white/10 bg-white/[0.025] px-2.5 text-xs shadow-none *:data-[slot=select-value]:block *:data-[slot=select-value]:truncate"
                >
                  <SelectValue>{formatReasoningEffort(reasoningEffort)}</SelectValue>
                </SelectTrigger>
                <SelectContent align="start">
                  {model.reasoningEfforts.map((effort) => (
                    <SelectItem key={effort} value={effort}>
                      {formatReasoningEffort(effort)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {resolved.notice ? (
            <p role="status" className="mt-2 text-[11px] leading-4 text-amber-200/78">
              {resolved.notice}
            </p>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
