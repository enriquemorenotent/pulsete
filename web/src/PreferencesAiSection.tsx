import { useId } from 'react';
import { Checkbox } from '@/components/ui/checkbox.js';
import { AiAssistantConnectionPanel } from './AiAssistantConnectionPanel.js';

export function PreferencesAiSection({
  replySuggestionsEnabled,
  onSetReplySuggestionsEnabled,
}: {
  replySuggestionsEnabled: boolean;
  onSetReplySuggestionsEnabled: (enabled: boolean) => void;
}) {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-foreground">AI</h2>
        <p className="text-[12px] text-muted-foreground">
          Uses Codex OpenAI login only. API keys are not supported.
        </p>
      </div>
      <AiAssistantConnectionPanel />
      <label className="flex items-start justify-between gap-4 rounded-lg bg-secondary/50 p-4">
        <span className="space-y-1">
          <span id={labelId} className="block text-sm font-medium">Suggest replies in direct messages</span>
          <span id={descriptionId} className="block text-sm text-muted-foreground">
            Sends up to eight recent messages from the open direct conversation to OpenAI through your Codex sign-in.
          </span>
        </span>
        <Checkbox
          aria-labelledby={labelId}
          aria-describedby={descriptionId}
          checked={replySuggestionsEnabled}
          onCheckedChange={(checked) => onSetReplySuggestionsEnabled(checked === true)}
        />
      </label>
    </section>
  );
}
