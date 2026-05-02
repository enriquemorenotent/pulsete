import { memo } from 'react';
import { Button } from '@/components/ui/button.js';
import { AutosaveNotesEditor } from './AutosaveNotesEditor.js';
import { NicklistPanel } from './NicklistPanel.js';
import { QueryProfileSidebar } from './QueryProfileSidebar.js';
import type { DesktopShellNicklistModel } from './desktop-shell-model.js';
import { findNickEmoji } from './nick-emoji-utils.js';
import type { WorkspaceView } from './workspace-types.js';
import type { BufferState, NetworkProfile, NickEmojiState } from '../../shared/protocol.js';

type WorkspaceRightSidebarProps = {
  workspace: WorkspaceView;
  nicklist: DesktopShellNicklistModel;
  serverProfile?: {
    network: WorkspaceView['selectedNetwork'];
    onEdit: () => void;
    onSaveNotes: (network: NonNullable<WorkspaceView['selectedNetwork']>, notes: string) => Promise<NetworkProfile | null>;
  };
  queryProfile?: {
    buffer: BufferState | null;
    nickEmoji?: NickEmojiState | null;
    network: NetworkProfile | null;
    onSaveNotes: (buffer: BufferState, notes: string) => Promise<BufferState | null>;
    onSaveNickEmoji: (networkId: string, nick: string, emoji: string | null) => Promise<boolean>;
  };
};

const isServerProfileWorkspace = (workspace: WorkspaceView) =>
  workspace.selectedBuffer?.kind === 'server';

const isQueryProfileWorkspace = (workspace: WorkspaceView) =>
  workspace.selectedBuffer?.kind === 'query';

export const WorkspaceRightSidebar = memo(function WorkspaceRightSidebar(props: WorkspaceRightSidebarProps) {
  if (isServerProfileWorkspace(props.workspace)) {
    return (
      <ServerProfileSidebar
        network={props.serverProfile?.network ?? null}
        fallbackNetwork={props.workspace.selectedNetwork}
        onEdit={props.serverProfile?.onEdit ?? (() => undefined)}
        onSaveNotes={props.serverProfile?.onSaveNotes ?? (async () => null)}
      />
    );
  }

  if (isQueryProfileWorkspace(props.workspace)) {
    return (
      <QueryProfileSidebar
        buffer={props.queryProfile?.buffer ?? props.workspace.selectedBuffer}
        nickEmoji={
          props.queryProfile?.nickEmoji
          ?? (props.workspace.selectedBuffer
            ? findNickEmoji(
                props.nicklist.nickEmojis,
                props.workspace.selectedBuffer.networkId,
                props.workspace.selectedBuffer.target,
              )
            : null)
        }
        network={props.queryProfile?.network ?? props.workspace.selectedNetwork}
        onSaveNotes={props.queryProfile?.onSaveNotes ?? (async () => null)}
        onSaveNickEmoji={props.queryProfile?.onSaveNickEmoji ?? (async () => false)}
      />
    );
  }

  if (!props.workspace.showNicklist || !props.workspace.selectedChannel) {
    return null;
  }

  return (
    <div className="h-full px-3 py-4">
      <NicklistPanel
        network={props.workspace.selectedNetwork}
        channel={props.workspace.selectedChannel}
        friends={props.nicklist.friends}
        mutedNicks={props.nicklist.mutedNicks}
        nickEmojis={props.nicklist.nickEmojis}
        contactNotificationSettings={props.nicklist.contactNotificationSettings}
        contactRuleHandlers={props.nicklist.contactRuleHandlers}
        onSaveNickEmoji={props.nicklist.onSaveNickEmoji}
        onSelectNick={props.nicklist.onSelectNick}
      />
    </div>
  );
});

function ServerProfileSidebar(props: {
  network: WorkspaceView['selectedNetwork'];
  fallbackNetwork: WorkspaceView['selectedNetwork'];
  onEdit: () => void;
  onSaveNotes: (network: NonNullable<WorkspaceView['selectedNetwork']>, notes: string) => Promise<NetworkProfile | null>;
}) {
  const network = props.network ?? props.fallbackNetwork;

  if (!network) {
    return null;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 px-3 py-4">
      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Profile</p>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{network.name}</p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">
              {network.host}:{network.port}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={props.onEdit} disabled={!props.network}>
            Edit
          </Button>
        </div>
      </div>

      <AutosaveNotesEditor
        id="server-profile-notes"
        notes={network.notes ?? ''}
        onSave={(notes) => props.onSaveNotes(network, notes).then(Boolean)}
        placeholder="Character, aliases, plot hooks..."
        scopeKey={network.id}
      />
    </div>
  );
}
