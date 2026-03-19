import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';
import {
  messageDisplayModes,
  messageDisplayModeLabels,
  type MessageDisplayMode,
} from './message-display-mode.js';

type MessageDisplayModeToggleProps = {
  value: MessageDisplayMode;
  onChange: (mode: MessageDisplayMode) => void;
};

export function MessageDisplayModeToggle(props: MessageDisplayModeToggleProps) {
  return (
    <div
      role="group"
      aria-label="Message display mode"
      className="flex items-center rounded-md border border-border bg-background/70 p-1"
    >
      {messageDisplayModes.map((mode) => {
        const selected = mode === props.value;
        return (
          <Button
            key={mode}
            type="button"
            size="sm"
            variant={selected ? 'secondary' : 'ghost'}
            aria-pressed={selected}
            className={cn('h-6 px-2', !selected && 'text-muted-foreground')}
            onClick={() => props.onChange(mode)}
          >
            {messageDisplayModeLabels[mode]}
          </Button>
        );
      })}
    </div>
  );
}
