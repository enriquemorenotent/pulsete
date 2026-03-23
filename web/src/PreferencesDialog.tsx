import { curatedAssistantModels } from '../../shared/assistant-defaults.js';
import type { AssistantSnapshot } from '../../shared/protocol.js';
import { AssistantRateLimitsPanel } from './AssistantRateLimitsPanel.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Separator } from '@/components/ui/separator.js';

export type PreferencesDialogProps = {
  open: boolean;
  assistant: AssistantSnapshot;
  onClose: () => void;
  onStartLogin: () => Promise<unknown>;
  onCancelLogin: (loginId: string) => Promise<unknown>;
  onLogout: () => Promise<unknown>;
  onChangeModel: (model: string) => Promise<unknown>;
};

export function PreferencesDialog(props: PreferencesDialogProps) {
  const modelOptions = props.assistant.models.length > 0
    ? props.assistant.models
    : curatedAssistantModels.map((id) => ({
        id,
        displayName: id,
      }));

  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="max-w-[42rem]">
        <DialogHeader className="space-y-1">
          <DialogTitle>Preferences</DialogTitle>
          <DialogDescription>
            Global settings apply to the assistant everywhere, across channels and private messages.
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-foreground">AI Assistant</h3>
              <p className="text-[13px] text-muted-foreground">OpenAI via ChatGPT OAuth.</p>
            </div>
            <Badge variant={props.assistant.auth.account ? 'success' : 'secondary'}>
              {props.assistant.auth.account ? 'Signed In' : 'Signed Out'}
            </Badge>
          </div>

          <div className="space-y-2 border border-border bg-secondary/30 px-3 py-3 text-[13px]">
            <p className="text-foreground">{authDescription(props.assistant)}</p>
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
            <AssistantRateLimitsPanel
              rateLimitBuckets={props.assistant.rateLimitBuckets}
              rateLimits={props.assistant.rateLimits}
            />
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

          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-foreground">Default model</span>
            <select
              value={props.assistant.defaultModel}
              onChange={(event) => void props.onChangeModel(event.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              {modelOptions.map((model) => (
                <option key={model.id} value={model.id}>{model.displayName}</option>
              ))}
            </select>
            <p className="text-[13px] text-muted-foreground">
              New assistant threads start with this model unless you change it later.
            </p>
          </label>
        </section>

        <DialogFooter>
          <Button variant="outline" onClick={props.onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
