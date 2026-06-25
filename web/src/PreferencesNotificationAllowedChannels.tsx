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
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Notification Channels
        </p>
        <p className="text-muted-foreground">
          Channels with notifications enabled.
        </p>
      </div>

      {props.channels.length > 0 ? (
        <ul className="space-y-2">
          {props.channels.map((channel) => {
            const networkName = props.networkNameById.get(channel.networkId) ?? channel.networkId;
            return (
              <li
                key={`${channel.networkId}:${channel.channel.toLowerCase()}`}
                className="flex items-center justify-between gap-3 rounded-md border border-white/6 bg-black/14 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{channel.channel}</p>
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
        <p className="text-muted-foreground">
          No notification channels yet.
        </p>
      )}
    </div>
  );
}
