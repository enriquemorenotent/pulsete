import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';
import type { ChatPaneHeaderAction } from './chat-pane-header-actions.js';

type ChatPaneHeaderActionMenuProps = {
  actions: ChatPaneHeaderAction[];
};

export function ChatPaneHeaderActionMenu(props: ChatPaneHeaderActionMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (props.actions.length === 0) {
    return null;
  }

  return (
    <div ref={menuRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-7"
        aria-label="More actions"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal />
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 min-w-44 rounded-[0.9rem] border border-white/10 bg-background/96 p-1 shadow-[0_16px_40px_rgba(0,0,0,0.38)] backdrop-blur-xl"
        >
          {props.actions.map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              className={cn(
                'flex w-full items-center rounded-[0.7rem] px-2.5 py-2 text-left text-[12px] transition-colors hover:bg-white/[0.06]',
                action.tone === 'danger' ? 'text-rose-300 hover:bg-rose-400/10 hover:text-rose-200' : 'text-foreground'
              )}
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
