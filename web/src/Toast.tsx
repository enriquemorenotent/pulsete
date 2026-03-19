import { AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import type { Banner } from './app-types.js';

type ToastProps = {
  banner: Banner;
  onDismiss: () => void;
};

export function Toast({ banner, onDismiss }: ToastProps) {
  if (!banner) {
    return null;
  }

  const Icon = banner.kind === 'error' ? AlertCircle : Info;

  return (
    <div className="pointer-events-none fixed right-3 top-3 z-[60] w-full max-w-sm" aria-live="polite" aria-atomic="true">
      <div
        className={cn(
          'pointer-events-auto flex items-start gap-2 border px-3 py-2 text-[13px] shadow-[0_12px_32px_rgba(0,0,0,0.45)]',
          banner.kind === 'error' ? 'border-destructive/40 bg-card' : 'border-primary/35 bg-card'
        )}
      >
        <Icon className={cn('mt-0.5 size-4 shrink-0', banner.kind === 'error' ? 'text-red-300' : 'text-primary')} />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">{banner.kind === 'error' ? 'Error' : 'Notice'}</p>
          <p className="mt-0.5 text-muted-foreground">{banner.message}</p>
        </div>
        <button
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          onClick={onDismiss}
          aria-label="Dismiss notification"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
