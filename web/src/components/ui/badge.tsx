import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils.js';

const badgeVariants = cva(
  'inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]',
  {
    variants: {
      variant: {
        default: 'border-primary/45 bg-primary/10 text-primary',
        secondary: 'border-border bg-secondary text-muted-foreground',
        outline: 'border-border bg-transparent text-foreground',
        success: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300',
        destructive: 'border-destructive/35 bg-destructive/10 text-red-200',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export type BadgeProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>;

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
