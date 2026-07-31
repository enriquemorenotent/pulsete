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
    <InspectorPanel className="gap-0 px-0 py-0">
      <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.055] bg-white/[0.012] px-4 py-4">
        {props.profileImagesVisible !== false && props.avatarUser ? (
          <QueryProfileAvatarBanner
            bufferId={buffer.id}
            customAvatarUrl={props.customAvatarUrl}
            enabled={props.externalAvatarsEnabled}
            networkId={buffer.networkId}
            onSetCustomAvatarUrl={props.onSetCustomAvatarUrl}
            user={props.avatarUser}
            variant="compact"
          />
        ) : (
          <ProfileInitial target={buffer.target} />
        )}
        <h2 className="min-w-0 truncate text-[15px] font-semibold tracking-tight text-foreground/92">
          {buffer.target}
        </h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <AutosaveNotesEditor
          fill={false}
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

function ProfileInitial(props: { target: string }) {
  const initial = props.target.trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      aria-hidden
      className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.045] text-base font-semibold text-foreground/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    >
      {initial}
    </div>
  );
}
