import { useMemo } from 'react';
import { curatedAssistantModels } from '../../shared/assistant-defaults.js';
import type { AssistantSnapshot, NetworkProfile } from '../../shared/protocol.js';
import { AssistantRateLimitsPanel } from './AssistantRateLimitsPanel.js';
import type {
  BackgroundDmAudioContact,
  BackgroundDmAudioSettings,
} from './background-dm-audio.js';
import { BACKGROUND_DM_AUDIO_SOUND_OPTIONS } from './background-dm-audio.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.js';
import { Separator } from '@/components/ui/separator.js';

const preferenceSelectTriggerClassName =
  'w-full rounded-lg border-white/10 bg-white/[0.035] text-[13px] shadow-none hover:border-white/18';

export type PreferencesDialogBodyProps = {
  assistant: AssistantSnapshot;
  backgroundDmAudio: BackgroundDmAudioSettings;
  networks: NetworkProfile[];
  onStartLogin: () => Promise<unknown>;
  onCancelLogin: (loginId: string) => Promise<unknown>;
  onLogout: () => Promise<unknown>;
  onChangeModel: (model: string) => Promise<unknown>;
  onSetBackgroundDmAudioEnabled: (enabled: boolean) => void;
  onSetBackgroundDmAudioSound: (sound: BackgroundDmAudioSettings['sound']) => void;
  onPreviewBackgroundDmAudioSound: (sound: BackgroundDmAudioSettings['sound']) => void;
  onRemoveBackgroundDmAudioContact: (contact: BackgroundDmAudioContact) => void;
};

export function PreferencesDialogBody(props: PreferencesDialogBodyProps) {
  const modelOptions = props.assistant.models.length > 0
    ? props.assistant.models
    : curatedAssistantModels.map((id) => ({
        id,
        displayName: id,
      }));
  const networkNameById = useMemo(
    () => new Map(props.networks.map((network) => [network.id, network.name])),
    [props.networks],
  );
  const sortedAudioContacts = useMemo(
    () => [...props.backgroundDmAudio.contacts].sort((left, right) => {
      const leftNetwork = networkNameById.get(left.networkId) ?? left.networkId;
      const rightNetwork = networkNameById.get(right.networkId) ?? right.networkId;
      return leftNetwork === rightNetwork
        ? left.nick.localeCompare(right.nick)
        : leftNetwork.localeCompare(rightNetwork);
    }),
    [networkNameById, props.backgroundDmAudio.contacts],
  );

  return (
    <>
      <section className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">Background DM audio cue</h3>
            <p className="text-[13px] text-muted-foreground">
              Play a short sound when an allowed contact sends a private message in another buffer.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-white/16 hover:text-foreground">
            <Checkbox
              checked={props.backgroundDmAudio.enabled}
              onCheckedChange={(checked) => props.onSetBackgroundDmAudioEnabled(checked === true)}
              aria-label="Enable background DM audio cue"
            />
            <span>Enabled</span>
          </label>
        </div>

        <div className="space-y-3 border border-border bg-secondary/30 px-3 py-3 text-[13px]">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-1">
              <span className="block text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Sound
              </span>
              <Select
                value={props.backgroundDmAudio.sound}
                onValueChange={(value) =>
                  props.onSetBackgroundDmAudioSound(
                    value as BackgroundDmAudioSettings['sound'],
                  )}
              >
                <SelectTrigger
                  aria-label="Audio cue sound"
                  size="sm"
                  className={preferenceSelectTriggerClassName}
                >
                  <SelectValue placeholder="Select a sound" />
                </SelectTrigger>
                <SelectContent>
                  {BACKGROUND_DM_AUDIO_SOUND_OPTIONS.map((option) => (
                    <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => props.onPreviewBackgroundDmAudioSound(props.backgroundDmAudio.sound)}
                aria-label="Preview audio cue sound"
              >
                Preview
              </Button>
            </div>
          </div>

          <p className="text-muted-foreground">
            Add contacts from a private-message header. Use this list to review or remove them later.
          </p>

          {sortedAudioContacts.length > 0 ? (
            <ul className="space-y-2">
              {sortedAudioContacts.map((contact) => {
                const networkName = networkNameById.get(contact.networkId) ?? contact.networkId;
                return (
                  <li
                    key={`${contact.networkId}:${contact.nick}`}
                    className="flex items-center justify-between gap-3 rounded-md border border-white/6 bg-black/14 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{contact.nick}</p>
                      <p className="truncate text-[12px] text-muted-foreground">{networkName}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => props.onRemoveBackgroundDmAudioContact(contact)}
                      aria-label={`Remove ${contact.nick} from background DM audio`}
                    >
                      Remove
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted-foreground">
              No contacts selected yet. Turn on sound notifications from a private-message header to add one.
            </p>
          )}
        </div>
      </section>

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

        <div className="space-y-1.5">
          <span className="block text-sm font-medium text-foreground">Default model</span>
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
          <p className="text-[13px] text-muted-foreground">
            New assistant threads start with this model unless you change it later.
          </p>
        </div>
      </section>
    </>
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
