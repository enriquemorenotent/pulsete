import { useId } from 'react';
import type { ContactNotificationSettings } from './contact-notifications/settings.js';
import { CONTACT_NOTIFICATION_SOUND_OPTIONS } from './contact-notifications/settings.js';
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

type PreferencesNotificationSoundSectionProps = {
  enabled: boolean;
  sound: ContactNotificationSettings['sound'];
  onPreviewSound: (sound: ContactNotificationSettings['sound']) => void;
  onSetEnabled: (enabled: boolean) => void;
  onSetSound: (sound: ContactNotificationSettings['sound']) => void;
};

export function PreferencesNotificationSoundSection(
  props: PreferencesNotificationSoundSectionProps,
) {
  const soundEnabledId = useId();
  return (
    <div className="space-y-3 rounded-md border border-white/6 bg-black/14 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Play sound cue</p>
          <p className="text-muted-foreground">
            Play a short sound when an allowed conversation has new unread messages.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-white/16 hover:text-foreground">
          <Checkbox
            id={soundEnabledId}
            checked={props.enabled}
            onCheckedChange={(checked) => props.onSetEnabled(checked === true)}
            aria-label="Play sound cues for allowed conversations"
          />
          <label htmlFor={soundEnabledId} className="cursor-pointer">Sound</label>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-1">
          <span className="block text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Sound
          </span>
          <Select
            value={props.sound}
            onValueChange={(value) =>
              props.onSetSound(value as ContactNotificationSettings['sound'])}
          >
            <SelectTrigger
              aria-label="Notification sound"
              size="sm"
              className={preferenceSelectTriggerClassName}
            >
              <SelectValue placeholder="Select a sound" />
            </SelectTrigger>
            <SelectContent>
              {CONTACT_NOTIFICATION_SOUND_OPTIONS.map((option) => (
                <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => props.onPreviewSound(props.sound)}
            aria-label="Preview notification sound"
          >
            Preview
          </Button>
        </div>
      </div>
    </div>
  );
}
