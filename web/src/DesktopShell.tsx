import type { RefObject } from 'react';
import { PanelsTopLeft } from 'lucide-react';
import type { BufferState, ChannelState, ChatMessage, FriendState, NetworkProfile } from '../../shared/protocol.js';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';
import { ChatPane } from './ChatPane.js';
import { ConnectionSidebar } from './ConnectionSidebar.js';
import { MessageDisplayModeToggle } from './MessageDisplayModeToggle.js';
import { NicklistPanel } from './NicklistPanel.js';
import { NetworkEditorDialog } from './NetworkEditorDialog.js';
import { NetworkManagerDialog } from './NetworkManagerDialog.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import type { EditorTab, NetworkForm } from './network-form.js';
import type { NetworkRuntimeState, SelectedBuffer, WorkspaceView } from './workspace.js';

type DesktopShellProps = {
  workspace: WorkspaceView;
  connectionInstances: NetworkProfile[];
  friends: FriendState[];
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
  onSelectNetworkBuffer: (network: NetworkProfile) => void;
  onSelectTabBuffer: (buffer: BufferState) => void;
  onSelectPrivateBuffer: (network: NetworkProfile, nick: string) => void;
  onOpenMentionedChannel: (channel: string) => void;
  onCloseChannel: (networkId: string, channel: string) => void;
  onCloseBuffer: (buffer: BufferState) => void;
  onSelectManagedNetwork: (networkId: string) => void;
  onToggleFavoritesOnly: () => void;
  onCloseNetworkManager: () => void;
  onOpenNewNetworkEditor: () => void;
  onOpenManagedNetworkEditor: () => void;
  onDeleteManagedNetwork: () => void;
  onConnectManagedNetwork: () => void;
  onToggleFavoriteManagedNetwork: () => void;
  onCloseNetworkEditor: () => void;
  onSubmitNetwork: () => void;
  onNetworkFormChange: (form: Partial<NetworkForm>) => void;
  onEditorTabChange: (tab: EditorTab) => void;
};

export function DesktopShell(props: DesktopShellProps) {
  const workspaceClass = cn(
    'grid h-full min-h-0 flex-1 gap-2 overflow-hidden',
    props.workspace.showNicklist
      ? 'grid-cols-1 xl:grid-cols-[16rem_minmax(0,1fr)_13rem]'
      : 'grid-cols-1 xl:grid-cols-[16rem_minmax(0,1fr)]'
  );

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
            Network List
          </Button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 overflow-hidden p-2">
        <div className={workspaceClass}>
          <ConnectionSidebar
            networks={props.connectionInstances}
            friends={props.friends}
            buffers={props.buffers}
            channels={props.channels}
            networkStates={props.networkStates}
            onAddFriend={props.onAddFriend}
            onRemoveFriend={props.onRemoveFriend}
            onSelectFriend={props.onSelectFriend}
            selection={props.selection}
            onSelectNetwork={props.onSelectNetworkBuffer}
            onSelectBuffer={props.onSelectTabBuffer}
            onCloseConnection={props.onCloseConnection}
            onCloseChannel={props.onCloseChannel}
            onCloseBuffer={props.onCloseBuffer}
          />
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
            onReconnect={props.onReconnectNetwork}
            onDisconnect={props.onDisconnectNetwork}
            onCloseConnection={props.onCloseConnection}
            onAddFriend={props.onAddFriend}
            onRemoveFriend={props.onRemoveFriend}
            onOpenMentionedChannel={props.onOpenMentionedChannel}
            onCloseChannel={props.onCloseChannel}
            onCloseBuffer={props.onCloseBuffer}
          />
          {props.workspace.showNicklist && props.workspace.selectedChannel ? (
            <NicklistPanel
              network={props.workspace.selectedNetwork}
              channel={props.workspace.selectedChannel}
              friends={props.friends}
              onAddFriend={props.onAddFriend}
              onRemoveFriend={props.onRemoveFriend}
              onSelectNick={props.onSelectPrivateBuffer}
            />
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
