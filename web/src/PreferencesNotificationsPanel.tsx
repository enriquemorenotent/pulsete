import { useMemo } from 'react';
import type { MutedNickState, NetworkProfile } from '../../shared/protocol.js';
import type {
  BackgroundDmAudioContact,
  BackgroundDmAudioSettings,
} from './background-dm-audio.js';
import { BACKGROUND_DM_AUDIO_SOUND_OPTIONS } from './background-dm-audio.js';
import { Button } from '@/components/ui/button.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.js';

const preferenceSelectTriggerClassName =
  'w-full rounded-lg border-white/10 bg-white/[0.035] text-[13px] shadow-none hover:border-white/18';

const notificationPermissionCopy: Record<NotificationPermission | 'unsupported', string> = {
  default: 'Permission not granted yet. Allow notifications in the browser first.',
  denied: 'Notifications are blocked in browser site settings.',
  granted: 'Permission granted.',
  unsupported: 'This browser does not support system notifications.',
};

type PreferencesNotificationsPanelProps = {
  backgroundDmAudio: BackgroundDmAudioSettings;
  backgroundDmAudioSystemPermission: NotificationPermission | 'unsupported';
  mutedNicks: MutedNickState[];
  networks: NetworkProfile[];
  onSetBackgroundDmAudioEnabled: (enabled: boolean) => void;
  onSetBackgroundDmAudioSystemEnabled: (enabled: boolean) => void;
  onRequestBackgroundDmAudioSystemPermission: () => Promise<
    NotificationPermission | 'unsupported'
  >;
  onSetBackgroundDmAudioSound: (sound: BackgroundDmAudioSettings['sound']) => void;
  onPreviewBackgroundDmAudioSound: (sound: BackgroundDmAudioSettings['sound']) => void;
  onRemoveBackgroundDmAudioContact: (contact: BackgroundDmAudioContact) => void;
  onRemoveMutedNick: (mutedNickId: string) => Promise<boolean>;
};

export function PreferencesNotificationsPanel(props: PreferencesNotificationsPanelProps) {
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
  const sortedMutedNicks = useMemo(
    () => [...props.mutedNicks].sort((left, right) => {
      const leftNetwork = networkNameById.get(left.networkId) ?? left.networkId;
      const rightNetwork = networkNameById.get(right.networkId) ?? right.networkId;
      return leftNetwork === rightNetwork
        ? left.nick.localeCompare(right.nick)
        : leftNetwork.localeCompare(rightNetwork);
    }),
    [networkNameById, props.mutedNicks],
  );

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          Private Message Notifications
        </h3>
        <p className="text-[13px] text-muted-foreground">
          Turn notifications on from a private-message header, then choose how they should be delivered here.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-secondary/30 px-4 py-4 text-[13px]">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Delivery Methods
          </p>
          <p className="text-muted-foreground">
            Contacts selected from a private-message header can use one or both delivery methods below.
          </p>
        </div>

        <div className="space-y-3 rounded-md border border-white/6 bg-black/14 px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Play sound cue</p>
              <p className="text-muted-foreground">
                Play a short sound when an allowed private-message contact writes in another buffer.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-white/16 hover:text-foreground">
              <Checkbox
                checked={props.backgroundDmAudio.enabled}
                onCheckedChange={(checked) => props.onSetBackgroundDmAudioEnabled(checked === true)}
                aria-label="Play sound cues for allowed private messages"
              />
              <span>Sound</span>
            </label>
          </div>

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
                  aria-label="Notification sound"
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
                aria-label="Preview notification sound"
              >
                Preview
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-md border border-white/6 bg-black/14 px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Show system notifications</p>
              <p className="text-muted-foreground">
                Show OS-level alerts when an allowed private-message contact writes while this app is in the background.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-white/16 hover:text-foreground">
              <Checkbox
                checked={props.backgroundDmAudio.systemEnabled}
                disabled={props.backgroundDmAudioSystemPermission !== 'granted'}
                onCheckedChange={(checked) =>
                  props.onSetBackgroundDmAudioSystemEnabled(checked === true)}
                aria-label="Show system notifications for allowed private messages"
              />
              <span>System</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
            <span>{notificationPermissionCopy[props.backgroundDmAudioSystemPermission]}</span>
            {props.backgroundDmAudioSystemPermission === 'default' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const permission =
                    await props.onRequestBackgroundDmAudioSystemPermission();
                  if (permission === 'granted') {
                    props.onSetBackgroundDmAudioSystemEnabled(true);
                  }
                }}
              >
                Allow in Browser
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Allowed Contacts
            </p>
            <p className="text-muted-foreground">
              Add contacts from a private-message header. This list controls which PMs are eligible for any notification method.
            </p>
          </div>

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
              No contacts selected yet. Use a private-message header to enable notifications for a contact.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Muted Nicks
            </p>
            <p className="text-muted-foreground">
              Muted nicks stay stored in history, but their new traffic is hidden and does not count as unread.
            </p>
          </div>

          {sortedMutedNicks.length > 0 ? (
            <ul className="space-y-2">
              {sortedMutedNicks.map((mutedNick) => {
                const networkName = networkNameById.get(mutedNick.networkId) ?? mutedNick.networkId;
                return (
                  <li
                    key={mutedNick.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-white/6 bg-black/14 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{mutedNick.nick}</p>
                      <p className="truncate text-[12px] text-muted-foreground">{networkName}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void props.onRemoveMutedNick(mutedNick.id)}
                      aria-label={`Unmute ${mutedNick.nick}`}
                    >
                      Remove
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted-foreground">
              No muted nicks yet. Use a query header or nicklist row to mute someone.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
