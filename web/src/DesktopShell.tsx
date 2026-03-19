import type { RefObject } from 'react';
import { LogOut, PanelsTopLeft, Radio } from 'lucide-react';
import type { ChannelState, ChatMessage, NetworkProfile, QueryBuffer } from '../../shared/protocol.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';
import { ChatPane } from './ChatPane.js';
import { ConnectionSidebar } from './ConnectionSidebar.js';
import { NicklistPanel } from './NicklistPanel.js';
import { NetworkEditorDialog } from './NetworkEditorDialog.js';
import { NetworkManagerDialog } from './NetworkManagerDialog.js';
import type { EditorTab, NetworkForm } from './network-form.js';
import type { NetworkRuntimeState, SelectedBuffer, WorkspaceView } from './workspace.js';

type DesktopShellProps = {
  workspace: WorkspaceView;
  connectionInstances: NetworkProfile[];
  channels: ChannelState[];
  queries: QueryBuffer[];
  networkStates: Record<string, NetworkRuntimeState>;
  selection: SelectedBuffer | null;
  selectedMessages: ChatMessage[];
  draft: string;
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
  onOpenNetworkManager: () => void;
  onLogout: () => void;
  onDraftChange: (value: string) => void;
  onSendComposer: () => void;
  onReconnectNetwork: (network: NetworkProfile) => void;
  onDisconnectNetwork: (networkId: string) => void;
  onCloseConnection: (network: NetworkProfile) => void;
  onSelectNetworkBuffer: (network: NetworkProfile) => void;
  onSelectChannelBuffer: (network: NetworkProfile, channel: ChannelState) => void;
  onSelectPrivateBuffer: (network: NetworkProfile, nick: string) => void;
  onCloseChannel: (networkId: string, channel: string) => void;
  onCloseQuery: (networkId: string, target: string) => void;
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
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold tracking-tight">Pulsete</span>
            <Badge variant="outline">IRC</Badge>
          </div>
          <p className="truncate font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {props.workspace.headerTitle}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge variant={props.workspace.statusLabel === 'Connected' ? 'success' : 'secondary'}>
            <Radio className="size-3" />
            {props.workspace.statusLabel}
          </Badge>
          <Button variant="outline" size="sm" onClick={props.onOpenNetworkManager}>
            <PanelsTopLeft />
            Network List
          </Button>
          <Button variant="ghost" size="sm" onClick={props.onLogout}>
            <LogOut />
            Sign out
          </Button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 overflow-hidden p-2">
        <div className={workspaceClass}>
          <ConnectionSidebar
            networks={props.connectionInstances}
            channels={props.channels}
            queries={props.queries}
            networkStates={props.networkStates}
            selection={props.selection}
            onSelectNetwork={props.onSelectNetworkBuffer}
            onSelectChannel={props.onSelectChannelBuffer}
            onSelectQuery={props.onSelectPrivateBuffer}
            onCloseConnection={props.onCloseConnection}
            onCloseChannel={props.onCloseChannel}
            onCloseQuery={props.onCloseQuery}
          />
          <ChatPane
            workspace={props.workspace}
            selectedMessages={props.selectedMessages}
            draft={props.draft}
            scrollRef={props.scrollRef}
            onDraftChange={props.onDraftChange}
            onSend={props.onSendComposer}
            onReconnect={props.onReconnectNetwork}
            onDisconnect={props.onDisconnectNetwork}
            onCloseConnection={props.onCloseConnection}
            onCloseChannel={props.onCloseChannel}
            onCloseQuery={props.onCloseQuery}
          />
          {props.workspace.showNicklist && props.workspace.selectedChannel ? (
            <NicklistPanel
              network={props.workspace.selectedNetwork}
              channel={props.workspace.selectedChannel}
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
