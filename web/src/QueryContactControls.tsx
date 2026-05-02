import type { FriendState } from '../../shared/protocol.js';
import { ContactRuleIconButton } from './ContactRuleButtons.js';

type QueryContactControlsProps = {
  nick: string;
  friend: FriendState | null;
  notifications: boolean;
  muted: boolean;
  onAddFriend: (nick: string) => Promise<boolean>;
  onRemoveFriend: (friendId: string) => Promise<boolean>;
  onToggleNotifications?: () => void;
  onMute?: () => Promise<boolean>;
  onUnmute?: () => Promise<boolean>;
};

export function QueryContactControls(props: QueryContactControlsProps) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <ContactRuleIconButton
        kind="friend"
        active={Boolean(props.friend)}
        label={
          props.friend
            ? `Remove ${props.nick} from watchlist`
            : `Add ${props.nick} to watchlist`
        }
        onClick={() => {
          void (props.friend
            ? props.onRemoveFriend(props.friend.id)
            : props.onAddFriend(props.nick));
        }}
      />
      <ContactRuleIconButton
        kind="notifications"
        active={props.notifications}
        label={
          props.notifications
            ? `Disable notifications for ${props.nick}`
            : `Enable notifications for ${props.nick}`
        }
        onClick={() => props.onToggleNotifications?.()}
      />
      <ContactRuleIconButton
        kind="muted"
        active={props.muted}
        label={props.muted ? `Unmute ${props.nick}` : `Mute ${props.nick}`}
        onClick={() => {
          void (props.muted ? props.onUnmute?.() : props.onMute?.());
        }}
      />
    </div>
  );
}
