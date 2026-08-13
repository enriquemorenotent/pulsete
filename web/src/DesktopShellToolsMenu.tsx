import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Bug, ChevronDown, FolderSearch, PanelsTopLeft, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button.js';

type DesktopShellToolsMenuProps = {
  iconOnly?: boolean;
  onDownloadDiagnostics: () => void;
  onOpenLogInspector: () => void;
  onOpenNetworkManager: () => void;
  onOpenPreferences: () => void;
};

export function DesktopShellToolsMenu(props: DesktopShellToolsMenuProps) {
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

  return (
    <div ref={menuRef} className="relative shrink-0">
      <Button
        type="button"
        variant="ghost"
        size={props.iconOnly ? 'icon' : 'sm'}
        aria-label="Tools"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        <Settings2 />
        {props.iconOnly ? <span className="sr-only">Tools</span> : <><span>Tools</span><ChevronDown className="size-3" /></>}
      </Button>
      {open ? (
        <div
          role="menu"
          className={props.iconOnly
            ? 'absolute left-full bottom-0 z-40 ml-2 min-w-48 overflow-hidden rounded-[0.9rem] border border-white/10 bg-popover p-1 shadow-[0_16px_40px_rgba(0,0,0,0.38)]'
            : 'absolute right-0 top-full z-40 mt-2 min-w-48 overflow-hidden rounded-[0.9rem] border border-white/10 bg-popover p-1 shadow-[0_16px_40px_rgba(0,0,0,0.38)]'}
        >
          <DesktopShellToolsMenuItem
            icon={<FolderSearch className="size-3.5" />}
            label="Logs"
            onSelect={() => {
              setOpen(false);
              props.onOpenLogInspector();
            }}
          />
          <DesktopShellToolsMenuItem
            icon={<Bug className="size-3.5" />}
            label="Capture memory diagnostics"
            onSelect={() => {
              setOpen(false);
              props.onDownloadDiagnostics();
            }}
          />
          <DesktopShellToolsMenuItem
            icon={<Settings2 className="size-3.5" />}
            label="Preferences"
            onSelect={() => {
              setOpen(false);
              props.onOpenPreferences();
            }}
          />
          <DesktopShellToolsMenuItem
            icon={<PanelsTopLeft className="size-3.5" />}
            label="Network Manager"
            onSelect={() => {
              setOpen(false);
              props.onOpenNetworkManager();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function DesktopShellToolsMenuItem(props: {
  icon: ReactNode;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="flex w-full items-center gap-2 rounded-[0.7rem] px-2.5 py-2 text-left text-[12px] text-foreground transition-colors hover:bg-white/[0.06]"
      onClick={props.onSelect}
    >
      <span className="text-muted-foreground">{props.icon}</span>
      <span>{props.label}</span>
    </button>
  );
}
