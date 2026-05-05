import type { BufferState, NetworkProfile, NickEmojiState } from '../../shared/protocol-chat.js';
import type { NetworkUserIdentity } from '../../shared/user-identity.js';
import { AutosaveNotesEditor } from './AutosaveNotesEditor.js';
import { NickEmojiEditorControl } from './NickEmojiEditorControl.js';
import {
  InspectorHeader,
  InspectorPanel,
  InspectorSection,
  MetadataRow,
} from './RightSidebarInspector.js';

export function QueryProfileSidebar(props: {
  buffer: BufferState | null;
  identity?: NetworkUserIdentity | null;
  nickEmoji?: NickEmojiState | null;
  network: NetworkProfile | null;
  onSaveNotes: (buffer: BufferState, notes: string) => Promise<BufferState | null>;
  onSaveNickEmoji: (
    networkId: string,
    nick: string,
    emoji: string | null,
    identity?: NetworkUserIdentity | null,
  ) => Promise<boolean>;
}) {
  const buffer = props.buffer;

  if (!buffer) {
    return null;
  }

  const identity = props.identity ?? props.nickEmoji?.identity ?? buffer.peerIdentity ?? null;
  const identityLabel = identity ? formatIdentityLabel(identity) : null;
  const network = props.network;

  return (
    <InspectorPanel>
      <InspectorHeader
        eyebrow="Private message"
        title={buffer.target}
        subtitle={network?.name ?? buffer.networkId}
        actions={network ? (
          <NickEmojiEditorControl
            emoji={props.nickEmoji?.emoji ?? null}
            nick={buffer.target}
            onSave={(emoji) =>
              props.onSaveNickEmoji(
                network.id,
                buffer.target,
                emoji,
                identity,
              )}
          />
        ) : null}
      />

      <InspectorSection title="Details">
        <dl className="space-y-1.5">
          <MetadataRow label="Network" value={network?.name ?? buffer.networkId} />
          {identityLabel ? <MetadataRow label="Identity" value={identityLabel} /> : null}
        </dl>
      </InspectorSection>

      <AutosaveNotesEditor
        id="query-profile-notes"
        notes={buffer.notes ?? ''}
        onSave={(notes) => props.onSaveNotes(buffer, notes).then(Boolean)}
        placeholder="Character, aliases, plot hooks..."
        scopeKey={buffer.id}
      />
    </InspectorPanel>
  );
}

function formatIdentityLabel(identity: NetworkUserIdentity) {
  if (identity.kind === 'account') {
    return `Account ${identity.value}`;
  }
  if (identity.kind === 'userhost') {
    return `Userhost ${identity.value}`;
  }
  return `Nick ${identity.value}`;
}
