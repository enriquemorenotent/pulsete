import type { MutedNickState } from '../../shared/protocol-chat.js';
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
        <p className="text-xs text-muted-foreground">
          Muted nicks stay stored in history, but their new traffic is hidden and does not count as unread.
        </p>
      </div>

      {props.mutedNicks.length > 0 ? (
        <ul className="divide-y divide-white/6">
          {props.mutedNicks.map((mutedNick) => {
            const networkName = props.networkNameById.get(mutedNick.networkId) ?? mutedNick.networkId;
            return (
              <li
                key={mutedNick.id}
                className="flex items-center justify-between gap-3 px-1 py-2"
              >
                <div className="flex min-w-0 flex-1 items-baseline gap-3">
                  <p className="w-32 shrink-0 truncate text-sm font-medium text-foreground">{mutedNick.nick}</p>
                  <p className="truncate text-[12px] text-muted-foreground">{networkName}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void props.onRemoveMutedNick(mutedNick.id)}
                  aria-label={`Unmute ${mutedNick.nick}`}
                >
                  Unmute
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          No muted nicks yet.
        </p>
      )}
    </div>
  );
}
