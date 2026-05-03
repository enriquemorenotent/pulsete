import type { BufferState, NetworkProfile, NickEmojiState } from '../../shared/protocol-chat.js';
import type { NetworkUserIdentity } from '../../shared/user-identity.js';
import { AutosaveNotesEditor } from './AutosaveNotesEditor.js';
import { NickEmojiEditorControl } from './NickEmojiEditorControl.js';

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

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 px-3 py-4">
      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Private message</p>
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
            <span className="truncate">{buffer.target}</span>
            {props.network ? (
              <NickEmojiEditorControl
                emoji={props.nickEmoji?.emoji ?? null}
                nick={buffer.target}
                onSave={(emoji) =>
                  props.onSaveNickEmoji(
                    props.network!.id,
                    buffer.target,
                    emoji,
                    props.identity ?? props.nickEmoji?.identity,
                  )}
              />
            ) : null}
          </p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {props.network?.name ?? buffer.networkId}
          </p>
        </div>
      </div>

      <AutosaveNotesEditor
        id="query-profile-notes"
        notes={buffer.notes ?? ''}
        onSave={(notes) => props.onSaveNotes(buffer, notes).then(Boolean)}
        placeholder="Character, aliases, plot hooks..."
        scopeKey={buffer.id}
      />
    </div>
  );
}
