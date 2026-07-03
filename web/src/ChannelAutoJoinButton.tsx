import { LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { headerIconButtonClass } from './header-icon-button-style.js';

type ChannelAutoJoinButtonProps = {
  active: boolean;
  channel: string;
  onToggle: () => void;
};

export function ChannelAutoJoinButton(props: ChannelAutoJoinButtonProps) {
  const label = props.active
    ? `Disable autojoin for ${props.channel}`
    : `Enable autojoin for ${props.channel}`;
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className={headerIconButtonClass(props.active)}
      aria-label={label}
      aria-pressed={props.active}
      title={label}
      onClick={props.onToggle}
    >
      <LogIn className="size-4" />
    </Button>
  );
}
