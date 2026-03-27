import { curatedAssistantModels } from '../../shared/assistant-defaults.js';
import type { AssistantSnapshot } from '../../shared/protocol.js';
import { AssistantRateLimitsPanel } from './AssistantRateLimitsPanel.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.js';

const preferenceSelectTriggerClassName =
  'w-full rounded-lg border-white/10 bg-white/[0.035] text-[13px] shadow-none hover:border-white/18';

type PreferencesAssistantPanelProps = {
  assistant: AssistantSnapshot;
  onStartLogin: () => Promise<unknown>;
  onCancelLogin: (loginId: string) => Promise<unknown>;
  onLogout: () => Promise<unknown>;
  onChangeModel: (model: string) => Promise<unknown>;
};

export function PreferencesAssistantPanel(props: PreferencesAssistantPanelProps) {
  const modelOptions = props.assistant.models.length > 0
    ? props.assistant.models
    : curatedAssistantModels.map((id) => ({
        id,
        displayName: id,
      }));

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">Assistant</h3>
          <Badge variant={props.assistant.auth.account ? 'success' : 'secondary'}>
            {props.assistant.auth.account ? 'Signed In' : 'Signed Out'}
          </Badge>
        </div>
        <p className="text-[13px] text-muted-foreground">
          Account, model, and usage settings for the built-in assistant.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-secondary/30 px-4 py-4 text-[13px]">
        <div className="space-y-2">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Account
            </p>
            <p className="text-foreground">{authDescription(props.assistant)}</p>
          </div>
          {props.assistant.auth.lastError ? (
            <p className="text-destructive">{props.assistant.auth.lastError}</p>
          ) : null}
          {props.assistant.serviceStatus === 'error' && props.assistant.serviceError ? (
            <p className="text-destructive">{props.assistant.serviceError}</p>
          ) : null}
          {props.assistant.auth.pendingAuthUrl ? (
            <p className="text-muted-foreground">
              If the sign-in page did not open,{' '}
              <a
                href={props.assistant.auth.pendingAuthUrl}
                target="_blank"
                rel="noreferrer"
                className="text-foreground underline underline-offset-4"
              >
                continue in a browser tab
              </a>
              .
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {props.assistant.auth.account ? (
              <Button variant="outline" size="sm" onClick={() => void props.onLogout()}>
                Sign out
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => void props.onStartLogin()}
                disabled={props.assistant.serviceStatus !== 'ready'}
              >
                Sign in
              </Button>
            )}
            {props.assistant.auth.pendingLoginId ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void props.onCancelLogin(props.assistant.auth.pendingLoginId!)}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="block text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Default Model
          </span>
          <Select
            value={props.assistant.defaultModel}
            onValueChange={(value) => void props.onChangeModel(value)}
          >
            <SelectTrigger
              aria-label="Default model"
              size="sm"
              className={preferenceSelectTriggerClassName}
            >
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((model) => (
                <SelectItem key={model.id} value={model.id}>{model.displayName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground">
            New assistant threads start with this model unless you change it later.
          </p>
        </div>

        <details className="rounded-md border border-white/6 bg-black/14 px-3 py-3">
          <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Usage
                </p>
                <p className="text-muted-foreground">
                  Codex limits and remaining quota.
                </p>
              </div>
              <span className="text-xs text-muted-foreground">Show</span>
            </div>
          </summary>
          <div className="mt-3">
            <AssistantRateLimitsPanel
              rateLimitBuckets={props.assistant.rateLimitBuckets}
              rateLimits={props.assistant.rateLimits}
            />
          </div>
        </details>
      </div>
    </section>
  );
}

const authDescription = (assistant: AssistantSnapshot) =>
  assistant.auth.account?.type === 'chatgpt'
    ? `${assistant.auth.account.email} · ${assistant.auth.account.planType}`
    : assistant.auth.pendingLoginId
      ? 'Waiting for ChatGPT sign-in to complete.'
      : assistant.serviceStatus === 'starting'
        ? 'Assistant service is starting.'
        : 'Sign in once here to enable the assistant across the whole app.';
