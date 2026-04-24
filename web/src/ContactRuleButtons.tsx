import { Bell, Settings, Star, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';

export type ContactRuleKind = 'friend' | 'notifications' | 'muted';

const contactRuleIcons = {
  friend: Star,
  notifications: Bell,
  muted: VolumeX,
} satisfies Record<ContactRuleKind, typeof Star>;

export function ContactRuleIconButton(props: {
  kind: ContactRuleKind;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = contactRuleIcons[props.kind];
  const activeClass = props.kind === 'muted'
    ? 'border-amber-300/25 bg-amber-300/10 text-amber-300 hover:text-amber-300'
    : 'border-primary/25 bg-primary/10 text-primary hover:text-primary';

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className={cn(
        'size-7 border text-muted-foreground hover:text-foreground',
        props.active ? activeClass : 'border-transparent',
      )}
      aria-label={props.label}
      aria-pressed={props.active}
      title={props.label}
      onClick={props.onClick}
    >
      <Icon className={cn('size-4', props.active && 'fill-current')} />
    </Button>
  );
}

export function ContactSettingsIconButton(props: {
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className={cn(
        'size-7 text-muted-foreground hover:text-foreground',
        props.active && 'text-primary hover:text-primary',
      )}
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
    >
      <Settings className="size-4" />
    </Button>
  );
}
