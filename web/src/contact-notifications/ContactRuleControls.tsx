import { ContactRuleIconButton } from '../ContactRuleButtons.js';
import type { ContactRuleHandlers, ContactRuleState } from './contact-rules.js';

type ContactRuleControlsProps = {
  className?: string;
  handlers: ContactRuleHandlers;
  state: ContactRuleState;
};

export function ContactRuleControls(props: ContactRuleControlsProps) {
  const nick = props.state.contact.nick;
  return (
    <div className={props.className ?? 'flex shrink-0 items-center gap-1.5'}>
      <ContactRuleIconButton
        kind="friend"
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
