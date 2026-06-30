import { AiAssistantConnectionPanel } from './AiAssistantConnectionPanel.js';

export function PreferencesAiSection() {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-foreground">AI</h2>
        <p className="text-[12px] text-muted-foreground">
          Uses Codex OpenAI login only. API keys are not supported.
        </p>
      </div>
      <AiAssistantConnectionPanel />
    </section>
  );
}
