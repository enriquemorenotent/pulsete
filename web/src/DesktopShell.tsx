import { useRef, type CSSProperties } from 'react';
import { PanelsTopLeft, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { ChatPane } from './ChatPane.js';
import { ConnectionSidebar } from './ConnectionSidebar.js';
import { MessageDisplayModeToggle } from './MessageDisplayModeToggle.js';
import { NetworkEditorDialog } from './NetworkEditorDialog.js';
import { NetworkManagerDialog } from './NetworkManagerDialog.js';
import { PreferencesDialog } from './PreferencesDialog.js';
import { SidebarResizeHandle } from './SidebarResizeHandle.js';
import { WorkspaceRightSidebar } from './WorkspaceRightSidebar.js';
import type { DesktopShellModel } from './desktop-shell-model.js';
import { useSidebarResize } from './useSidebarResize.js';

export function DesktopShell(props: DesktopShellModel) {
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const sidebarResize = useSidebarResize(layoutRef);
  const showRightSidebar = props.workspace.selectedBuffer?.kind === 'channel' || props.workspace.selectedBuffer?.kind === 'query';
  const layoutStyle = {
    '--sidebar-width': `${sidebarResize.sidebarWidth}px`,
  } as CSSProperties;

  return (
    <div className="fixed inset-0 flex min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-3 py-2">
        <span className="font-semibold tracking-tight">Pulsete</span>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
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
        <div
          ref={layoutRef}
          style={layoutStyle}
          className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden xl:flex-row xl:gap-0"
        >
          <div className="min-h-0 xl:w-[var(--sidebar-width)] xl:shrink-0">
            <ConnectionSidebar {...props.sidebar} />
          </div>
          <SidebarResizeHandle
            sidebarWidth={sidebarResize.sidebarWidth}
            isResizing={sidebarResize.isResizing}
            onPointerDown={sidebarResize.startDragging}
            onNudge={sidebarResize.nudgeWidth}
            onReset={sidebarResize.resetWidth}
          />
          <div className="min-h-0 min-w-0 flex-1">
            <ChatPane {...props.chat} />
          </div>
          {showRightSidebar ? (
            <div className="h-[28rem] min-h-[24rem] xl:ml-2 xl:h-full xl:min-h-0 xl:w-[22rem] xl:shrink-0">
              <WorkspaceRightSidebar
                workspace={props.workspace}
                nicklist={props.nicklist}
                assistant={props.assistant}
              />
            </div>
          ) : null}
        </div>
      </main>

      {props.networkManager.open ? (
        <NetworkManagerDialog
          networks={props.networkManager.networks}
          selected={props.networkManager.selected}
          runtime={props.networkManager.runtime}
          runtimes={props.networkManager.runtimes}
          showFavoritesOnly={props.networkManager.showFavoritesOnly}
          hiddenManagedNetworkName={props.networkManager.hiddenManagedNetworkName}
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
