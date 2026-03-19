import type { RefObject } from 'react';
import type { ChannelState, ChatMessage, NetworkProfile, QueryBuffer } from '../../shared/protocol.js';
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
  return (
    <div className="shell shell--desktop">
      <header className="topbar">
        <div>
          <p className="eyebrow">Pulsete</p>
          <h1>IRC</h1>
        </div>
        <div className="topbar__status">
          <span className={`pill ${props.workspace.statusLabel === 'Connected' ? 'pill--good' : 'pill--muted'}`}>
            {props.workspace.statusLabel}
          </span>
          <button className="button" onClick={props.onOpenNetworkManager}>Network List</button>
          <button className="button" onClick={props.onLogout}>Sign out</button>
        </div>
      </header>
      <main className={`workspace ${props.workspace.showNicklist ? '' : 'workspace--no-nicklist'}`}>
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
          selectedNetwork={props.workspace.selectedNetwork}
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
