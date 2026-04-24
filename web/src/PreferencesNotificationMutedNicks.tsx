import type { MutedNickState } from '../../shared/protocol.js';
import { Button } from '@/components/ui/button.js';

type PreferencesNotificationMutedNicksProps = {
  mutedNicks: MutedNickState[];
  networkNameById: Map<string, string>;
  onRemoveMutedNick: (mutedNickId: string) => Promise<boolean>;
};

export function PreferencesNotificationMutedNicks(
  props: PreferencesNotificationMutedNicksProps,
) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Muted Nicks
        </p>
        <p className="text-muted-foreground">
          Muted nicks stay stored in history, but their new traffic is hidden and does not count as unread.
        </p>
      </div>

      {props.mutedNicks.length > 0 ? (
        <ul className="space-y-2">
          {props.mutedNicks.map((mutedNick) => {
            const networkName = props.networkNameById.get(mutedNick.networkId) ?? mutedNick.networkId;
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
          No muted nicks yet.
        </p>
      )}
    </div>
  );
}
