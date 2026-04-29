import { memo, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button.js';
import { Label } from '@/components/ui/label.js';
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
    onSaveNotes: (network: NonNullable<WorkspaceView['selectedNetwork']>, notes: string) => Promise<unknown>;
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
        backgroundDmAudio={props.nicklist.backgroundDmAudio}
        onAddFriend={props.nicklist.onAddFriend}
        onAddNotificationContact={props.nicklist.onAddNotificationContact}
        onAddMutedNick={props.nicklist.onAddMutedNick}
        onRemoveFriend={props.nicklist.onRemoveFriend}
        onRemoveNotificationContact={props.nicklist.onRemoveNotificationContact}
        onRemoveMutedNick={props.nicklist.onRemoveMutedNick}
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
  onSaveNotes: (network: NonNullable<WorkspaceView['selectedNetwork']>, notes: string) => Promise<unknown>;
}) {
  const network = props.network ?? props.fallbackNetwork;
  const [draftNotes, setDraftNotes] = useState(network?.notes ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraftNotes(network?.notes ?? '');
  }, [network?.id, network?.notes]);

  if (!network) {
    return null;
  }

  const savedNotes = network.notes ?? '';
  const notesChanged = draftNotes !== savedNotes;
  const saveNotes = async () => {
    if (!notesChanged || saving) {
      return;
    }
    setSaving(true);
    try {
      await props.onSaveNotes(network, draftNotes);
    } finally {
      setSaving(false);
    }
  };

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

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="server-profile-notes">Notes</Label>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void saveNotes()}
            disabled={!notesChanged || saving}
          >
            {saving ? 'Saving' : 'Save'}
          </Button>
        </div>
        <textarea
          id="server-profile-notes"
          value={draftNotes}
          onChange={(event) => setDraftNotes(event.target.value)}
          placeholder="Character, aliases, plot hooks..."
          className="min-h-40 flex-1 resize-none rounded-sm border border-input bg-input px-3 py-2 text-[13px] leading-5 text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
        />
      </div>
    </div>
  );
}
