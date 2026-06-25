import type { BufferState } from '../../shared/protocol-chat.js';
import { AutosaveNotesEditor } from './AutosaveNotesEditor.js';
import {
  QueryProfileAvatarBanner,
  type QueryProfileAvatarUser,
} from './QueryProfileAvatarBanner.js';
import { InspectorPanel } from './RightSidebarInspector.js';

export function QueryProfileSidebar(props: {
  avatarUser?: QueryProfileAvatarUser | null;
  buffer: BufferState | null;
  customAvatarUrl?: string | null;
  externalAvatarsEnabled: boolean;
  onSetCustomAvatarUrl?: (url: string | null) => void;
  profileImagesVisible?: boolean;
  onSaveNotes: (buffer: BufferState, notes: string) => Promise<BufferState | null>;
}) {
  const buffer = props.buffer;

  if (!buffer) {
    return null;
  }

  return (
    <InspectorPanel className="px-0">
      <header className="shrink-0 space-y-3 border-b border-white/[0.045] pb-4">
        {props.profileImagesVisible === false ? null : (
          <QueryProfileAvatarBanner
            bufferId={buffer.id}
            customAvatarUrl={props.customAvatarUrl}
            enabled={props.externalAvatarsEnabled}
            networkId={buffer.networkId}
            onSetCustomAvatarUrl={props.onSetCustomAvatarUrl}
            user={props.avatarUser}
          />
        )}
        <h2 className="min-w-0 truncate px-4 text-sm font-semibold tracking-tight text-foreground/92">
          {buffer.target}
        </h2>
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-4">
        <AutosaveNotesEditor
          id="query-profile-notes"
          notes={buffer.notes ?? ''}
          onSave={(notes) => props.onSaveNotes(buffer, notes).then(Boolean)}
          placeholder="Character, aliases, plot hooks..."
          scopeKey={buffer.id}
        />
      </div>
    </InspectorPanel>
  );
}
