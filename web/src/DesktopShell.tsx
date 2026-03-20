import { useRef, type CSSProperties, type RefObject } from 'react';
import { PanelsTopLeft } from 'lucide-react';
import type { BufferState, ChannelState, ChatMessage, FriendState, NetworkProfile } from '../../shared/protocol.js';
import type { ChannelListState } from './app-types.js';
import { Button } from '@/components/ui/button.js';
import { ChatPane } from './ChatPane.js';
import { ConnectionSidebar } from './ConnectionSidebar.js';
import { MessageDisplayModeToggle } from './MessageDisplayModeToggle.js';
import { NicklistPanel } from './NicklistPanel.js';
import { NetworkEditorDialog } from './NetworkEditorDialog.js';
import { NetworkManagerDialog } from './NetworkManagerDialog.js';
import { SidebarResizeHandle } from './SidebarResizeHandle.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import type { EditorTab, NetworkForm } from './network-form.js';
import { useSidebarResize } from './useSidebarResize.js';
import type { NetworkRuntimeState, SelectedBuffer, WorkspaceView } from './workspace.js';

type DesktopShellProps = {
  workspace: WorkspaceView;
  connectionInstances: NetworkProfile[];
  friends: FriendState[];
  friendPresence: Record<string, boolean>;
  buffers: BufferState[];
  channels: ChannelState[];
  networkStates: Record<string, NetworkRuntimeState>;
  selection: SelectedBuffer | null;
  selectedMessages: ChatMessage[];
  draft: string;
  messageDisplayMode: MessageDisplayMode;
  showMessageDisplayModeToggle: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  showNetworkManager: boolean;
  showNetworkEditor: boolean;
  managedNetwork: NetworkProfile | null;
  managedRuntime: NetworkRuntimeState | null;
  visibleNetworks: NetworkProfile[];
  showFavoritesOnly: boolean;
  hiddenManagedNetworkName: string | null;
  networkForm: NetworkForm;
  editorTab: EditorTab;
  onMessageDisplayModeChange: (mode: MessageDisplayMode) => void;
  onOpenNetworkManager: () => void;
  onDraftChange: (value: string) => void;
  onRecallOlderDraft: () => void;
  onRecallNewerDraft: () => void;
  onSendComposer: () => Promise<void>;
  onReconnectNetwork: (network: NetworkProfile) => void;
  onDisconnectNetwork: (networkId: string) => void;
  onCloseConnection: (network: NetworkProfile) => void;
  onAddFriend: (nick: string) => Promise<boolean>;
  onRemoveFriend: (friendId: string) => Promise<boolean>;
  onSelectFriend: (friend: FriendState) => Promise<void>;
  channelList: ChannelListState;
  channelListNetwork: NetworkProfile | null;
  onCloseChannelList: () => void;
  onJoinChannelFromList: (channel: string) => Promise<void>;
  onSelectNetworkBuffer: (network: NetworkProfile) => void;
  onSelectTabBuffer: (buffer: BufferState) => void;
  onSelectPrivateBuffer: (network: NetworkProfile, nick: string) => void;
  onOpenChannelList: () => void;
  onOpenMentionedChannel: (channel: string) => void;
  onCloseChannel: (networkId: string, channel: string) => void;
  onCloseBuffer: (buffer: BufferState) => void;
  onSelectManagedNetwork: (networkId: string) => void;
  onToggleFavoritesOnly: () => void;
  onCloseNetworkManager: () => void;
  onOpenNewNetworkEditor: () => void;
  onOpenManagedNetworkEditor: () => void;
  onDuplicateManagedNetwork: () => void;
  onDeleteManagedNetwork: () => void;
  onConnectManagedNetwork: () => void;
  onToggleFavoriteManagedNetwork: () => void;
  onCloseNetworkEditor: () => void;
  onSubmitNetwork: () => void;
  onNetworkFormChange: (form: Partial<NetworkForm>) => void;
  onEditorTabChange: (tab: EditorTab) => void;
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
          {props.showMessageDisplayModeToggle ? (
            <MessageDisplayModeToggle
              value={props.messageDisplayMode}
              onChange={props.onMessageDisplayModeChange}
            />
          ) : null}
          <Button variant="outline" size="sm" onClick={props.onOpenNetworkManager}>
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
            <ConnectionSidebar
              networks={props.connectionInstances}
              friends={props.friends}
              friendPresence={props.friendPresence}
              buffers={props.buffers}
              channels={props.channels}
              networkStates={props.networkStates}
              onAddFriend={props.onAddFriend}
              onRemoveFriend={props.onRemoveFriend}
              onSelectFriend={props.onSelectFriend}
              selection={props.selection}
              onSelectNetwork={props.onSelectNetworkBuffer}
              onSelectBuffer={props.onSelectTabBuffer}
              onReconnectNetwork={props.onReconnectNetwork}
              onDisconnectNetwork={props.onDisconnectNetwork}
              onCloseConnection={props.onCloseConnection}
              onCloseChannel={props.onCloseChannel}
              onCloseBuffer={props.onCloseBuffer}
            />
          </div>
          <SidebarResizeHandle
            sidebarWidth={sidebarResize.sidebarWidth}
            isResizing={sidebarResize.isResizing}
            onPointerDown={sidebarResize.startDragging}
            onNudge={sidebarResize.nudgeWidth}
            onReset={sidebarResize.resetWidth}
          />
          <div className="min-h-0 min-w-0 flex-1">
            <ChatPane
              workspace={props.workspace}
              friends={props.friends}
              selectedMessages={props.selectedMessages}
              draft={props.draft}
              messageDisplayMode={props.messageDisplayMode}
              scrollRef={props.scrollRef}
              onDraftChange={props.onDraftChange}
              onRecallOlderDraft={props.onRecallOlderDraft}
              onRecallNewerDraft={props.onRecallNewerDraft}
              onSend={props.onSendComposer}
              onAddFriend={props.onAddFriend}
              onRemoveFriend={props.onRemoveFriend}
              channelList={props.channelList}
              channelListNetwork={props.channelListNetwork}
              onCloseChannelList={props.onCloseChannelList}
              onOpenMentionedChannel={props.onOpenMentionedChannel}
              onJoinChannelFromList={props.onJoinChannelFromList}
              onOpenChannelList={props.onOpenChannelList}
              onCloseChannel={props.onCloseChannel}
              onCloseBuffer={props.onCloseBuffer}
            />
          </div>
          {props.workspace.showNicklist && props.workspace.selectedChannel ? (
            <div className="min-h-0 xl:ml-2 xl:w-[13rem] xl:shrink-0">
              <NicklistPanel
                network={props.workspace.selectedNetwork}
                channel={props.workspace.selectedChannel}
                friends={props.friends}
                onAddFriend={props.onAddFriend}
                onRemoveFriend={props.onRemoveFriend}
                onSelectNick={props.onSelectPrivateBuffer}
              />
            </div>
          ) : null}
        </div>
      </main>

      {props.showNetworkManager ? (
        <NetworkManagerDialog
          networks={props.visibleNetworks}
          selected={props.managedNetwork}
          runtime={props.managedRuntime}
          showFavoritesOnly={props.showFavoritesOnly}
          hiddenManagedNetworkName={props.hiddenManagedNetworkName}
          onSelect={props.onSelectManagedNetwork}
          onToggleFavorites={props.onToggleFavoritesOnly}
          onClose={props.onCloseNetworkManager}
          onAdd={props.onOpenNewNetworkEditor}
          onEdit={props.onOpenManagedNetworkEditor}
          onDuplicate={props.onDuplicateManagedNetwork}
          onRemove={props.onDeleteManagedNetwork}
          onConnect={props.onConnectManagedNetwork}
          onFavorite={props.onToggleFavoriteManagedNetwork}
        />
      ) : null}
      {props.showNetworkEditor ? (
        <NetworkEditorDialog
          form={props.networkForm}
          activeTab={props.editorTab}
          onTabChange={props.onEditorTabChange}
          onClose={props.onCloseNetworkEditor}
          onSubmit={props.onSubmitNetwork}
          onChange={props.onNetworkFormChange}
        />
      ) : null}
    </div>
  );
}
