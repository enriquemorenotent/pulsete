import type { ContactNotificationChannel } from './contact-notifications/settings.js';
import { Button } from '@/components/ui/button.js';

type PreferencesNotificationAllowedChannelsProps = {
  channels: ContactNotificationChannel[];
  networkNameById: Map<string, string>;
  onRemoveChannel: (channel: ContactNotificationChannel) => void;
};

export function PreferencesNotificationAllowedChannels(
  props: PreferencesNotificationAllowedChannelsProps,
) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          Channels with notifications enabled.
        </p>
      </div>

      {props.channels.length > 0 ? (
        <ul className="divide-y divide-white/6">
          {props.channels.map((channel) => {
            const networkName = props.networkNameById.get(channel.networkId) ?? channel.networkId;
            return (
              <li
                key={`${channel.networkId}:${channel.channel.toLowerCase()}`}
                className="flex items-center justify-between gap-3 px-1 py-2"
              >
                <div className="flex min-w-0 flex-1 items-baseline gap-3">
                  <p className="w-32 shrink-0 truncate text-sm font-medium text-foreground">{channel.channel}</p>
                  <p className="truncate text-[12px] text-muted-foreground">{networkName}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => props.onRemoveChannel(channel)}
                  aria-label={`Remove ${channel.channel} from notification channels`}
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          No notification channels yet.
        </p>
      )}
    </div>
  );
}
