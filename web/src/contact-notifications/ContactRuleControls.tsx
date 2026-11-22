import { ContactRuleIconButton } from '../ContactRuleButtons.js';
import type { ContactRuleHandlers, ContactRuleState } from './contact-rules.js';

type ContactRuleControlsProps = {
  className?: string;
  showLabels?: boolean;
  handlers: ContactRuleHandlers;
  state: ContactRuleState;
};

export function ContactRuleControls(props: ContactRuleControlsProps) {
  const nick = props.state.contact.nick;
  return (
    <div className={props.className ?? (props.showLabels ? 'grid gap-1' : 'flex shrink-0 items-center gap-1.5')}>
      <ContactRuleIconButton
        kind="friend"
        visibleLabel={props.showLabels ? 'Watchlist' : undefined}
        active={Boolean(props.state.friend)}
        label={
          props.state.friend
            ? `Remove ${nick} from watchlist`
            : `Add ${nick} to watchlist`
        }
        onClick={() => {
          void (props.state.friend
            ? props.handlers.removeFriend(props.state)
            : props.handlers.addFriend(props.state));
        }}
      />
      <ContactRuleIconButton
        kind="notifications"
        visibleLabel={props.showLabels ? 'Notifications' : undefined}
        active={props.state.notificationsEnabled}
        label={
          props.state.notificationsEnabled
            ? `Disable notifications for ${nick}`
            : `Enable notifications for ${nick}`
        }
        onClick={() => {
          void props.handlers.toggleNotifications(props.state);
        }}
      />
      <ContactRuleIconButton
        kind="muted"
        visibleLabel={props.showLabels ? 'Mute' : undefined}
        active={Boolean(props.state.mutedNick)}
        label={props.state.mutedNick ? `Unmute ${nick}` : `Mute ${nick}`}
        onClick={() => {
          void (props.state.mutedNick
            ? props.handlers.unmute(props.state)
            : props.handlers.mute(props.state));
        }}
      />
    </div>
  );
}
