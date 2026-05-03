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
    <section className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          Avatars
        </h3>
        <p className="text-[13px] text-muted-foreground">
          Show public IRCCloud avatars when Pulsete can identify a user from channel presence.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-secondary/30 px-4 py-4 text-[13px]">
        <div className="flex items-start justify-between gap-3 rounded-md border border-white/6 bg-black/14 px-3 py-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Show external avatars</p>
            <p className="text-muted-foreground">
              Loads matching avatar images from IRCCloud&apos;s CDN in nicklists and private-message headers.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-white/16 hover:text-foreground">
            <Checkbox
              id={externalAvatarsId}
              checked={props.settings.externalAvatarsEnabled}
              onCheckedChange={(checked) =>
                props.onSetExternalAvatarsEnabled(checked === true)}
              aria-label="Show external IRCCloud avatars"
            />
            <label htmlFor={externalAvatarsId} className="cursor-pointer">External</label>
          </div>
        </div>
      </div>
    </section>
  );
}
