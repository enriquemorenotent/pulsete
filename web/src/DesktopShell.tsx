import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { PanelsTopLeft, Search, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { ChatPane } from './ChatPane.js';
import { CommandPaletteDialog } from './CommandPaletteDialog.js';
import { shouldOpenCommandPaletteFromKeydown } from './command-palette.js';
import { ConnectionSidebar } from './ConnectionSidebar.js';
import {
  getDefaultCompactWorkspacePane,
  resolveCompactWorkspacePane,
  type CompactWorkspacePane,
} from './desktop-shell-layout.js';
import { MessageDisplayModeToggle } from './MessageDisplayModeToggle.js';
import { NetworkEditorDialog } from './NetworkEditorDialog.js';
import { NetworkManagerDialog } from './NetworkManagerDialog.js';
import { PreferencesDialog } from './PreferencesDialog.js';
import { SidebarResizeHandle } from './SidebarResizeHandle.js';
import {
  RIGHT_SIDEBAR_WIDTH_STORAGE_KEY,
  SIDEBAR_WIDTH_STORAGE_KEY,
} from './sidebar-width.js';
import { useMediaQuery } from './useMediaQuery.js';
import { WorkspaceRightSidebar } from './WorkspaceRightSidebar.js';
import type { DesktopShellModel } from './desktop-shell-model.js';
import { useSidebarResize } from './useSidebarResize.js';

const compactDesktopShellQuery = '(max-width: 1023px)';

export function DesktopShell(props: DesktopShellModel) {
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const leftSidebarResize = useSidebarResize(layoutRef, {
    edge: 'left',
    storageKey: SIDEBAR_WIDTH_STORAGE_KEY,
  });
  const rightSidebarResize = useSidebarResize(layoutRef, {
    edge: 'right',
    storageKey: RIGHT_SIDEBAR_WIDTH_STORAGE_KEY,
  });
  const showRightSidebar = props.workspace.selectedBuffer?.kind === 'channel' || props.workspace.selectedBuffer?.kind === 'query';
  const selectedBufferId = props.workspace.selectedBuffer?.id ?? null;
  const compactLayout = useMediaQuery(compactDesktopShellQuery);
  const previousSelectedBufferIdRef = useRef(selectedBufferId);
  const [compactPane, setCompactPane] = useState<CompactWorkspacePane>(() =>
    getDefaultCompactWorkspacePane(selectedBufferId),
  );
  const layoutStyle = {
    '--sidebar-width': `${leftSidebarResize.sidebarWidth}px`,
    '--right-sidebar-width': `${rightSidebarResize.sidebarWidth}px`,
  } as CSSProperties;

  useEffect(() => {
    const previousSelectedBufferId = previousSelectedBufferIdRef.current;
    const nextPane = resolveCompactWorkspacePane({
      current: compactPane,
      selectedBufferId,
      previousSelectedBufferId,
      showAssistantPane: showRightSidebar,
    });
    previousSelectedBufferIdRef.current = selectedBufferId;
    if (nextPane !== compactPane) {
      setCompactPane(nextPane);
    }
  }, [compactPane, selectedBufferId, showRightSidebar]);

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      const blockingDialogOpen =
        !props.commandPalette.open && document.querySelector('[role="dialog"]') !== null;
      if (!shouldOpenCommandPaletteFromKeydown(event, {
        blockingDialogOpen,
        paletteOpen: props.commandPalette.open,
      })) {
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
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/6 bg-background/80 px-4 py-3 backdrop-blur-xl">
        <div className="mr-auto min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold tracking-tight text-foreground">Pulsete</span>
            <span className="rounded-md border border-white/8 bg-white/4 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              IRC
            </span>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          {props.header.showMessageDisplayModeToggle ? (
            <MessageDisplayModeToggle
              value={props.header.messageDisplayMode}
              onChange={props.header.onMessageDisplayModeChange}
            />
          ) : null}
          <Button variant="secondary" size="sm" onClick={props.commandPalette.onOpen}>
            <Search />
            Go to…
            <span className="text-[11px] font-normal text-muted-foreground">Ctrl/Cmd+K</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={props.header.onOpenPreferences}>
            <Settings2 />
            Preferences
          </Button>
          <Button variant="outline" size="sm" onClick={props.header.onOpenNetworkManager}>
            <PanelsTopLeft />
            Network Manager
          </Button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 overflow-hidden px-3 pb-3 pt-2">
        {compactLayout ? (
          <Tabs
            value={compactPane}
            onValueChange={(value) => setCompactPane(value as CompactWorkspacePane)}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-xl border border-white/6 bg-black/20 p-3 shadow-[0_20px_70px_rgba(0,0,0,0.42)]"
          >
            <TabsList className={`grid w-full shrink-0 ${showRightSidebar ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <TabsTrigger value="browse" className="min-w-0">Browse</TabsTrigger>
              <TabsTrigger value="chat" className="min-w-0" disabled={!selectedBufferId}>
                Chat
              </TabsTrigger>
              {showRightSidebar ? (
                <TabsTrigger value="assistant" className="min-w-0">Assistant</TabsTrigger>
              ) : null}
            </TabsList>
            <div className="min-h-0 flex-1 overflow-hidden">
              {compactPane === 'browse' ? (
                <ConnectionSidebar {...props.sidebar} />
              ) : null}
              {compactPane === 'chat' ? (
                <ChatPane {...props.chat} />
              ) : null}
              {compactPane === 'assistant' && showRightSidebar ? (
                <WorkspaceRightSidebar
                  workspace={props.workspace}
                  nicklist={props.nicklist}
                  assistant={props.assistant}
                  initialTab="assistant"
                />
              ) : null}
            </div>
          </Tabs>
        ) : (
          <div
            ref={layoutRef}
            style={layoutStyle}
            className="flex h-full min-h-0 flex-1 overflow-hidden rounded-lg border border-white/6 bg-black/20 shadow-[0_20px_70px_rgba(0,0,0,0.42)] lg:flex-row"
          >
            <div className="min-h-0 bg-card/50 backdrop-blur-xl lg:w-(--sidebar-width) lg:shrink-0">
              <ConnectionSidebar {...props.sidebar} />
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
              <ChatPane {...props.chat} />
            </div>
            {showRightSidebar ? (
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
                  <WorkspaceRightSidebar
                    workspace={props.workspace}
                    nicklist={props.nicklist}
                    assistant={props.assistant}
                  />
                </div>
              </>
            ) : null}
          </div>
        )}
      </main>

      {props.networkManager.open ? (
        <NetworkManagerDialog
          networks={props.networkManager.networks}
          selected={props.networkManager.selected}
          runtime={props.networkManager.runtime}
          runtimes={props.networkManager.runtimes}
          showFavoritesOnly={props.networkManager.showFavoritesOnly}
          onSelect={props.networkManager.onSelect}
          onToggleFavorites={props.networkManager.onToggleFavorites}
          onClose={props.networkManager.onClose}
          onAdd={props.networkManager.onAdd}
          onEdit={props.networkManager.onEdit}
          onDuplicate={props.networkManager.onDuplicate}
          onRemove={props.networkManager.onRemove}
          onConnect={props.networkManager.onConnect}
          onFavorite={props.networkManager.onFavorite}
        />
      ) : null}
      <CommandPaletteDialog
        open={props.commandPalette.open}
        entries={props.commandPalette.entries}
        onClose={props.commandPalette.onClose}
      />
      <PreferencesDialog {...props.preferences} />
      {props.networkEditor.open ? (
        <NetworkEditorDialog
          form={props.networkEditor.form}
          activeTab={props.networkEditor.activeTab}
          onTabChange={props.networkEditor.onTabChange}
          onClose={props.networkEditor.onClose}
          onSubmit={props.networkEditor.onSubmit}
          onChange={props.networkEditor.onChange}
        />
      ) : null}
    </div>
  );
}
