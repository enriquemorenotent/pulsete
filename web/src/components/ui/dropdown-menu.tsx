import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { DropdownMenu as Primitive } from 'radix-ui';
import { cn } from '@/lib/utils.js';
import { containOverlayKeyDown } from './overlay-keyboard.js';

const Content = forwardRef<ElementRef<typeof Primitive.Content>, ComponentPropsWithoutRef<typeof Primitive.Content>>(
  function MenuContent({ className, onKeyDown, ...props }, ref) {
    return <Primitive.Content
      ref={ref} align="end" sideOffset={8} collisionPadding={8}
      className={cn('z-50 min-w-44 overflow-hidden rounded-[0.9rem] border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none', className)}
      {...props}
      onKeyDown={event => { onKeyDown?.(event); containOverlayKeyDown(event); }}
    />;
  },
);

const Item = forwardRef<ElementRef<typeof Primitive.Item>, ComponentPropsWithoutRef<typeof Primitive.Item> & { tone?: 'danger' }>(
  function MenuItem({ className, tone, ...props }, ref) {
    return <Primitive.Item ref={ref}
      className={cn('flex cursor-default select-none items-center gap-2 rounded-[0.7rem] px-2.5 py-2 text-left text-xs outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-3.5 [&_svg]:shrink-0',
        tone === 'danger' && 'text-destructive data-[highlighted]:text-destructive', className)} {...props} />;
  },
);

export const DropdownMenu = {
  Root: Primitive.Root,
  Trigger: Primitive.Trigger,
  Portal: Primitive.Portal,
  Group: Primitive.Group,
  Label: Primitive.Label,
  Separator: Primitive.Separator,
  Content,
  Item,
};
