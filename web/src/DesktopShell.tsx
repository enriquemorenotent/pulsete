import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { PanelsTopLeft, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { ChatPane } from './ChatPane.js';
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

  return (
    <div className="fixed inset-0 flex min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <span className="mr-auto font-semibold tracking-tight">Pulsete</span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          {props.header.showMessageDisplayModeToggle ? (
            <MessageDisplayModeToggle
              value={props.header.messageDisplayMode}
              onChange={props.header.onMessageDisplayModeChange}
            />
          ) : null}
          <Button variant="outline" size="sm" onClick={props.header.onOpenPreferences}>
            <Settings2 />
            Preferences
          </Button>
          <Button variant="outline" size="sm" onClick={props.header.onOpenNetworkManager}>
            <PanelsTopLeft />
            Network Manager
          </Button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 overflow-hidden p-2">
        {compactLayout ? (
          <Tabs
            value={compactPane}
            onValueChange={(value) => setCompactPane(value as CompactWorkspacePane)}
            className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden"
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
            className="flex h-full min-h-0 flex-1 overflow-hidden lg:flex-row"
          >
            <div className="min-h-0 lg:w-[var(--sidebar-width)] lg:shrink-0">
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
            <div className="min-h-0 min-w-0 flex-1">
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
                <div className="min-h-0 lg:w-[var(--right-sidebar-width)] lg:shrink-0">
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
