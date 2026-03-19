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
      size="sm"
      variant="ghost"
      className={props.active ? 'text-primary hover:text-primary' : 'text-muted-foreground'}
      aria-label={props.active ? 'Remove friend' : 'Add friend'}
      onClick={props.onClick}
    >
      <Star className={props.active ? 'fill-current' : undefined} />
      {props.active ? 'Friend' : 'Add'}
    </Button>
  );
}
