import { cn } from '@/lib/utils.js';

type HeaderIconButtonTone = 'primary' | 'muted';

const inactiveHeaderIconButtonClass =
  'border-white/10 bg-white/[0.035] text-muted-foreground hover:border-white/18 hover:bg-white/[0.07] hover:text-foreground';

const activeHeaderIconButtonClasses = {
  muted: 'border-amber-300/25 bg-amber-300/10 text-amber-300 hover:text-amber-300',
  primary: 'border-primary/25 bg-primary/10 text-primary hover:text-primary',
} satisfies Record<HeaderIconButtonTone, string>;

export const headerIconButtonClass = (
  active = false,
  tone: HeaderIconButtonTone = 'primary',
) => cn(
  'size-7 border',
  active ? activeHeaderIconButtonClasses[tone] : inactiveHeaderIconButtonClass,
);
