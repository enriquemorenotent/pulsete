import { VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button.js';

type MuteToggleButtonProps = {
  active: boolean;
  onClick: () => void;
};

export function MuteToggleButton(props: MuteToggleButtonProps) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className={props.active ? 'size-7 text-amber-300 hover:text-amber-300' : 'size-7 text-muted-foreground'}
      aria-label={props.active ? 'Unmute nick' : 'Mute nick'}
      onClick={props.onClick}
    >
      <VolumeX className={props.active ? 'fill-current' : undefined} />
    </Button>
  );
}
