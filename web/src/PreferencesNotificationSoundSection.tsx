import { useId } from 'react';
import { Volume2, Play } from 'lucide-react';
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
    <div className="flex items-center gap-3 border-b border-white/6 py-4">
      <Volume2 aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-1">
        <label htmlFor={soundEnabledId} className="cursor-pointer text-sm font-medium">Sound</label>
        <p className="text-xs text-muted-foreground">For new unread messages.</p>
      </div>
      <div className="w-28 shrink-0">
        <Select value={props.sound} onValueChange={(value) => props.onSetSound(value as ContactNotificationSettings['sound'])}>
          <SelectTrigger aria-label="Notification sound" size="sm" className={preferenceSelectTriggerClassName}><SelectValue /></SelectTrigger>
          <SelectContent>{CONTACT_NOTIFICATION_SOUND_OPTIONS.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Button variant="ghost" size="sm" onClick={() => props.onPreviewSound(props.sound)} aria-label="Preview notification sound"><Play className="size-3.5" />Preview</Button>
      <Checkbox id={soundEnabledId} checked={props.enabled} onCheckedChange={(checked) => props.onSetEnabled(checked === true)} aria-label="Play sound cues for allowed conversations" />
    </div>
  );
}
