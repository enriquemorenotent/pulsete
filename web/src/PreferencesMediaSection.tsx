import { Image } from 'lucide-react';
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
    <section className="flex items-center gap-3 border-b border-white/6 py-5">
      <Image aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-1">
        <h4 className="text-sm font-medium">Media display</h4>
        <p className="text-xs leading-relaxed text-muted-foreground">Show or hide artwork, avatars, and previews across your workspace.</p>
      </div>
      <div className="w-36 shrink-0">
        <Select value={props.mode} onValueChange={(value) => props.onSetMode(value as MediaVisibilityMode)}>
          <SelectTrigger aria-label="Media display" size="sm" className={preferenceSelectTriggerClassName}>
            <SelectValue placeholder="Select media display" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="show-media">Show media</SelectItem>
            <SelectItem value="hide-media">Hide media</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </section>
  );
}
