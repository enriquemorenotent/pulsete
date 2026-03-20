import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button.js';

type FriendToggleButtonProps = {
  active: boolean;
  onClick: () => void;
};

export function FriendToggleButton(props: FriendToggleButtonProps) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className={props.active ? 'size-7 text-primary hover:text-primary' : 'size-7 text-muted-foreground'}
      aria-label={props.active ? 'Remove friend' : 'Add friend'}
      onClick={props.onClick}
    >
      <Star className={props.active ? 'fill-current' : undefined} />
    </Button>
  );
}
