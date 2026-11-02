import { UserRound } from 'lucide-react';
import { useId } from 'react';
import { Checkbox } from '@/components/ui/checkbox.js';
import type { UserAvatarSettings } from './user-avatars/settings.js';

type PreferencesAvatarSectionProps = {
  settings: UserAvatarSettings;
  onSetExternalAvatarsEnabled: (enabled: boolean) => void;
};

export function PreferencesAvatarSection(props: PreferencesAvatarSectionProps) {
  const externalAvatarsId = useId();
  return (
    <section className="flex items-center gap-3 py-5">
      <UserRound aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-1">
        <label htmlFor={externalAvatarsId} className="cursor-pointer text-sm font-medium">External avatars</label>
        <p className="text-xs leading-relaxed text-muted-foreground">Use public IRCCloud avatars for matching users when media is shown.</p>
      </div>
      <Checkbox id={externalAvatarsId} checked={props.settings.externalAvatarsEnabled}
        onCheckedChange={(checked) => props.onSetExternalAvatarsEnabled(checked === true)}
        aria-label="Show external IRCCloud avatars" />
    </section>
  );
}
