import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.js';
import type { NavigationLayoutMode } from './navigation-layout-settings.js';

const preferenceSelectTriggerClassName =
  'w-full rounded-lg border-white/10 bg-white/[0.035] text-[13px] shadow-none hover:border-white/18';

type PreferencesNavigationSectionProps = {
  mode: NavigationLayoutMode;
  onSetMode: (mode: NavigationLayoutMode) => void;
};

export function PreferencesNavigationSection(
  props: PreferencesNavigationSectionProps,
) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          Navigation
        </h3>
        <p className="text-[13px] text-muted-foreground">
          Choose how open servers and conversations are shown in the left sidebar.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-secondary/30 px-4 py-4 text-[13px]">
        <div className="space-y-2 rounded-md border border-white/6 bg-black/14 px-3 py-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Navigation layout</p>
            <p className="text-muted-foreground">
              The server rail keeps the server list separate and shows one server&apos;s tabs at a time.
            </p>
          </div>
          <Select
            value={props.mode}
            onValueChange={(value) => props.onSetMode(value as NavigationLayoutMode)}
          >
            <SelectTrigger
              aria-label="Navigation layout"
              size="sm"
              className={preferenceSelectTriggerClassName}
            >
              <SelectValue placeholder="Select a navigation layout" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-servers-visible">All servers</SelectItem>
              <SelectItem value="server-rail">Server rail</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>
  );
}
