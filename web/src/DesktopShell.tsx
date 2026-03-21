import { useRef, type CSSProperties } from 'react';
import { PanelsTopLeft } from 'lucide-react';
import type { FriendState, NetworkProfile } from '../../shared/protocol.js';
import { Button } from '@/components/ui/button.js';
import { ChatPane, type ChatPaneProps } from './ChatPane.js';
import { ConnectionSidebar, type ConnectionSidebarProps } from './ConnectionSidebar.js';
import { MessageDisplayModeToggle } from './MessageDisplayModeToggle.js';
import { NicklistPanel } from './NicklistPanel.js';
import { NetworkEditorDialog } from './NetworkEditorDialog.js';
import { NetworkManagerDialog } from './NetworkManagerDialog.js';
import { SidebarResizeHandle } from './SidebarResizeHandle.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import type { EditorTab, NetworkForm } from './network-form.js';
import { useSidebarResize } from './useSidebarResize.js';
import type { NetworkRuntimeState, WorkspaceView } from './workspace.js';

type DesktopShellProps = {
  workspace: WorkspaceView;
  header: {
    messageDisplayMode: MessageDisplayMode;
    showMessageDisplayModeToggle: boolean;
    onMessageDisplayModeChange: (mode: MessageDisplayMode) => void;
    onOpenNetworkManager: () => void;
  };
  sidebar: ConnectionSidebarProps;
  chat: ChatPaneProps;
  nicklist: {
    friends: FriendState[];
    onAddFriend: (nick: string) => Promise<boolean>;
    onRemoveFriend: (friendId: string) => Promise<boolean>;
    onSelectNick: (network: NetworkProfile, nick: string) => void;
  };
  networkManager: {
    open: boolean;
    networks: NetworkProfile[];
    selected: NetworkProfile | null;
    runtime: NetworkRuntimeState | null;
    showFavoritesOnly: boolean;
    hiddenManagedNetworkName: string | null;
    onSelect: (networkId: string) => void;
    onToggleFavorites: () => void;
    onClose: () => void;
    onAdd: () => void;
    onEdit: () => void;
    onDuplicate: () => void;
    onRemove: () => void;
    onConnect: () => void;
    onFavorite: () => void;
  };
  networkEditor: {
    open: boolean;
    form: NetworkForm;
    activeTab: EditorTab;
    onTabChange: (tab: EditorTab) => void;
    onClose: () => void;
    onSubmit: () => void;
    onChange: (form: Partial<NetworkForm>) => void;
  };
};

export function DesktopShell(props: DesktopShellProps) {
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const sidebarResize = useSidebarResize(layoutRef);
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
          {props.workspace.showNicklist && props.workspace.selectedChannel ? (
            <div className="min-h-0 xl:ml-2 xl:w-[13rem] xl:shrink-0">
              <NicklistPanel
                network={props.workspace.selectedNetwork}
                channel={props.workspace.selectedChannel}
                friends={props.nicklist.friends}
                onAddFriend={props.nicklist.onAddFriend}
                onRemoveFriend={props.nicklist.onRemoveFriend}
                onSelectNick={props.nicklist.onSelectNick}
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
