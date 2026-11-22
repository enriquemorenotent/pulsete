import { Bell, Star, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';
import { headerIconButtonClass } from './header-icon-button-style.js';

export type ContactRuleKind = 'friend' | 'notifications' | 'muted';

const contactRuleIcons = {
  friend: Star,
  notifications: Bell,
  muted: VolumeX,
} satisfies Record<ContactRuleKind, typeof Star>;

export function ContactRuleIconButton(props: {
  kind: ContactRuleKind;
  label: string;
  visibleLabel?: string;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = contactRuleIcons[props.kind];

  return (
    <Button
      type="button"
      size={props.visibleLabel ? 'sm' : 'icon'}
      variant="ghost"
      className={props.visibleLabel
        ? cn('justify-start', props.active && 'bg-accent')
        : headerIconButtonClass(props.active, props.kind === 'muted' ? 'muted' : 'primary')}
      aria-label={props.label}
      aria-pressed={props.active}
      title={props.label}
      onClick={props.onClick}
    >
      <Icon data-icon={props.visibleLabel ? 'inline-start' : undefined} className={cn('size-4', props.active && 'fill-current')} />
      {props.visibleLabel}
    </Button>
  );
}
