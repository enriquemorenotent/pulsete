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
            ? 'absolute left-full bottom-0 z-40 ml-2 min-w-44 overflow-hidden rounded-md border border-white/10 bg-popover p-0.5 shadow-[0_12px_32px_rgba(0,0,0,0.34)]'
            : 'absolute right-0 top-full z-40 mt-2 min-w-44 overflow-hidden rounded-md border border-white/10 bg-popover p-0.5 shadow-[0_12px_32px_rgba(0,0,0,0.34)]'}
        >
          <DesktopShellToolsMenuItem
            icon={<FolderSearch style={toolsMenuIconStyle} />}
            label="Logs"
            onSelect={() => {
              setOpen(false);
              props.onOpenLogInspector();
            }}
          />
          <DesktopShellToolsMenuItem
            icon={<Bug style={toolsMenuIconStyle} />}
            label="Capture memory diagnostics"
            onSelect={() => {
              setOpen(false);
              props.onDownloadDiagnostics();
            }}
          />
          <DesktopShellToolsMenuItem
            icon={<Settings2 style={toolsMenuIconStyle} />}
            label="Preferences"
            onSelect={() => {
              setOpen(false);
              props.onOpenPreferences();
            }}
          />
          <DesktopShellToolsMenuItem
            icon={<PanelsTopLeft style={toolsMenuIconStyle} />}
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
      className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-foreground/90 transition-colors hover:bg-white/[0.06] hover:text-foreground"
      style={{ fontSize: '10px', lineHeight: '14px' }}
      onClick={props.onSelect}
    >
      <span className="text-muted-foreground">{props.icon}</span>
      <span>{props.label}</span>
    </button>
  );
}

const toolsMenuIconStyle = { height: 10, width: 10 } as const;
