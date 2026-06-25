import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.js';
import type { MediaVisibilityMode } from './media-visibility-settings.js';

const preferenceSelectTriggerClassName =
  'w-full rounded-lg border-white/10 bg-white/[0.035] text-[13px] shadow-none hover:border-white/18';

type PreferencesMediaSectionProps = {
  mode: MediaVisibilityMode;
  onSetMode: (mode: MediaVisibilityMode) => void;
};

export function PreferencesMediaSection(props: PreferencesMediaSectionProps) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          Media
        </h3>
        <p className="text-[13px] text-muted-foreground">
          Choose whether passive images and previews are shown while using Pulsete.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-secondary/30 px-4 py-4 text-[13px]">
        <div className="space-y-2 rounded-md border border-white/6 bg-black/14 px-3 py-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Media display</p>
            <p className="text-muted-foreground">
              Hide media keeps server artwork, avatars, inline previews, and profile images out of passive views.
            </p>
          </div>
          <Select
            value={props.mode}
            onValueChange={(value) => props.onSetMode(value as MediaVisibilityMode)}
          >
            <SelectTrigger
              aria-label="Media display"
              size="sm"
              className={preferenceSelectTriggerClassName}
            >
              <SelectValue placeholder="Select media display" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="show-media">Show media</SelectItem>
              <SelectItem value="hide-media">Hide media</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>
  );
}
