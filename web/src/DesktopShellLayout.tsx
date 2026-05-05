import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { FolderSearch, Search } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { shouldOpenCommandPaletteFromKeydown } from './command-palette.js';
import {
  getDefaultCompactWorkspacePane,
  resolveCompactWorkspacePane,
  type CompactWorkspacePane,
} from './desktop-shell-layout.js';
import type {
  DesktopShellCommandPaletteModel,
  DesktopShellHeaderModel,
} from './desktop-shell-model.js';
import { DesktopShellToolsMenu } from './DesktopShellToolsMenu.js';
import { SidebarResizeHandle } from './SidebarResizeHandle.js';
import {
  RIGHT_SIDEBAR_WIDTH_STORAGE_KEY,
  SIDEBAR_WIDTH_STORAGE_KEY,
} from './sidebar-width.js';
import { useMediaQuery } from './useMediaQuery.js';
import { useSidebarResize } from './useSidebarResize.js';

const compactDesktopShellQuery = '(max-width: 1023px)';

export type DesktopShellLayoutProps = {
  chat: ReactNode;
  commandPalette: Pick<DesktopShellCommandPaletteModel, 'onOpen' | 'open'>;
  commandPaletteDialog: ReactNode;
  header: DesktopShellHeaderModel;
  logInspectorDialog: ReactNode;
  networkEditorDialog: ReactNode;
  networkManagerDialog: ReactNode;
  preferencesDialog: ReactNode;
  rightSidebar: ReactNode;
  rightSidebarKind: 'profile' | 'users' | 'notes' | null;
  selectedBufferId: string | null;
  sidebar: ReactNode;
};

export function DesktopShellLayout(props: DesktopShellLayoutProps) {
  const compactLayout = useMediaQuery(compactDesktopShellQuery);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const previousSelectedBufferIdRef = useRef(props.selectedBufferId);
  const [compactPane, setCompactPane] = useState<CompactWorkspacePane>(() =>
    getDefaultCompactWorkspacePane(props.selectedBufferId),
  );
  const leftSidebarResize = useSidebarResize(layoutRef, {
    edge: 'left',
    storageKey: SIDEBAR_WIDTH_STORAGE_KEY,
  });
  const rightSidebarResize = useSidebarResize(layoutRef, {
    edge: 'right',
    storageKey: RIGHT_SIDEBAR_WIDTH_STORAGE_KEY,
  });
  const layoutStyle = {
    '--sidebar-width': `${leftSidebarResize.sidebarWidth}px`,
    '--right-sidebar-width': `${rightSidebarResize.sidebarWidth}px`,
  } as CSSProperties;

  useEffect(() => {
    const nextPane = resolveCompactWorkspacePane({
      current: compactPane,
      selectedBufferId: props.selectedBufferId,
      previousSelectedBufferId: previousSelectedBufferIdRef.current,
      showDetailsPane: props.rightSidebarKind !== null,
    });
    previousSelectedBufferIdRef.current = props.selectedBufferId;
    if (nextPane !== compactPane) {
      setCompactPane(nextPane);
    }
  }, [compactPane, props.rightSidebarKind, props.selectedBufferId]);

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      const blockingDialogOpen =
        !props.commandPalette.open
        && document.querySelector('[role="dialog"]') !== null;
      if (
        !shouldOpenCommandPaletteFromKeydown(event, {
          blockingDialogOpen,
          paletteOpen: props.commandPalette.open,
        })
      ) {
        return;
      }
      event.preventDefault();
      props.commandPalette.onOpen();
    };
    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [props.commandPalette.onOpen, props.commandPalette.open]);

  return (
    <div className="fixed inset-0 flex min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(87,128,208,0.12),transparent_24%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_20%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))] text-foreground">
      <header className="relative z-30 flex shrink-0 flex-wrap items-center gap-3 border-b border-white/6 bg-background/80 px-4 py-3 backdrop-blur-xl">
        <div className="mr-auto min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold tracking-tight text-foreground">Pulsete</span>
            <span className="rounded-md border border-white/8 bg-white/4 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              IRC
            </span>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="h-8 min-w-[13rem] justify-start px-3"
            aria-label="Search Pulsete"
            onClick={props.commandPalette.onOpen}
          >
            <Search />
            <span className="min-w-0 flex-1 truncate text-left">Search Pulsete</span>
            <span className="hidden rounded border border-white/10 bg-black/20 px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground sm:inline-flex">
              Ctrl/Cmd+K
            </span>
          </Button>
          <Button variant="ghost" size="sm" onClick={props.header.onOpenLogInspector}>
            <FolderSearch />
            Logs
          </Button>
          <DesktopShellToolsMenu
            onOpenNetworkManager={props.header.onOpenNetworkManager}
            onOpenPreferences={props.header.onOpenPreferences}
          />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 overflow-hidden px-3 pb-3 pt-2">
        {compactLayout ? (
          <Tabs
            value={compactPane}
            onValueChange={(value) => setCompactPane(value as CompactWorkspacePane)}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-xl border border-white/6 bg-black/20 p-3 shadow-[0_20px_70px_rgba(0,0,0,0.42)]"
          >
            <TabsList className={`grid w-full shrink-0 ${props.rightSidebarKind ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <TabsTrigger value="browse" className="min-w-0">Browse</TabsTrigger>
              <TabsTrigger value="chat" className="min-w-0" disabled={!props.selectedBufferId}>
                Chat
              </TabsTrigger>
              {props.rightSidebarKind ? (
                <TabsTrigger value="details" className="min-w-0">
                  {rightSidebarLabel(props.rightSidebarKind)}
                </TabsTrigger>
              ) : null}
            </TabsList>
            <div className="min-h-0 flex-1 overflow-hidden">
              {compactPane === 'browse' ? props.sidebar : null}
              {compactPane === 'chat' ? props.chat : null}
              {compactPane === 'details' && props.rightSidebarKind ? props.rightSidebar : null}
            </div>
          </Tabs>
        ) : (
          <div
            ref={layoutRef}
            style={layoutStyle}
            className="flex h-full min-h-0 flex-1 overflow-hidden rounded-lg border border-white/6 bg-black/20 shadow-[0_20px_70px_rgba(0,0,0,0.42)] lg:flex-row"
          >
            <div className="min-h-0 bg-card/50 backdrop-blur-xl lg:w-(--sidebar-width) lg:shrink-0">
              {props.sidebar}
            </div>
            <SidebarResizeHandle
              sidebarWidth={leftSidebarResize.sidebarWidth}
              isResizing={leftSidebarResize.isResizing}
              edge="left"
              onPointerDown={leftSidebarResize.startDragging}
              onNudge={leftSidebarResize.nudgeWidth}
              onReset={leftSidebarResize.resetWidth}
            />
            <div className="min-h-0 min-w-0 flex-1 bg-[linear-gradient(180deg,rgba(255,255,255,0.025),transparent_14rem)]">
              {props.chat}
            </div>
            {props.rightSidebarKind ? (
              <>
                <SidebarResizeHandle
                  sidebarWidth={rightSidebarResize.sidebarWidth}
                  isResizing={rightSidebarResize.isResizing}
                  edge="right"
                  onPointerDown={rightSidebarResize.startDragging}
                  onNudge={rightSidebarResize.nudgeWidth}
                  onReset={rightSidebarResize.resetWidth}
                />
                <div className="min-h-0 bg-card/36 backdrop-blur-xl lg:w-[var(--right-sidebar-width)] lg:shrink-0">
                  {props.rightSidebar}
                </div>
              </>
            ) : null}
          </div>
        )}
      </main>

      {props.networkManagerDialog}
      {props.commandPaletteDialog}
      {props.logInspectorDialog}
      {props.preferencesDialog}
      {props.networkEditorDialog}
    </div>
  );
}

const rightSidebarLabel = (kind: NonNullable<DesktopShellLayoutProps['rightSidebarKind']>) =>
  kind === 'profile' ? 'Profile' : kind === 'users' ? 'Users' : 'Notes';
