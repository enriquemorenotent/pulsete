import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';

type ChannelNotificationButtonProps = {
  active: boolean;
  channel: string;
  onToggle: () => void;
};

export function ChannelNotificationButton(props: ChannelNotificationButtonProps) {
  const label = props.active
    ? `Disable notifications for ${props.channel}`
    : `Enable notifications for ${props.channel}`;
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className={cn(
        'size-7 border text-muted-foreground hover:text-foreground',
        props.active ? 'border-primary/25 bg-primary/10 text-primary hover:text-primary' : 'border-transparent',
      )}
      aria-label={label}
      aria-pressed={props.active}
      title={label}
      onClick={props.onToggle}
    >
      <Bell className={cn('size-4', props.active && 'fill-current')} />
    </Button>
  );
}
