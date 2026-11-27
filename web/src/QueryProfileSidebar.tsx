import type { ComponentProps } from 'react';
import { ChevronDown, NotebookPen, Pin } from 'lucide-react';
import type { BufferState } from '../../shared/protocol-chat.js';
import { AutosaveNotesEditor } from './AutosaveNotesEditor.js';
import { PinnedMessagesSidebar } from './PinnedMessagesSidebar.js';

export function QueryProfileSidebar(props: {
  buffer: BufferState | null;
  onSaveNotes: (buffer: BufferState, notes: string) => Promise<BufferState | null>;
  pinned?: Omit<ComponentProps<typeof PinnedMessagesSidebar>, 'buffer' | 'embedded'>;
}) {
  const buffer = props.buffer;
  if (!buffer) return null;
  const pinCount = props.pinned?.messages.length ?? 0;
  return (
    <aside aria-label="Conversation context" className="conversation-context h-full overflow-y-auto overscroll-contain px-4 py-2">
      <details open className="conversation-notes group/notes border-b border-white/[0.07] open:pb-1">
        <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <NotebookPen className="size-3.5 text-muted-foreground" aria-hidden />
          Notes
          <ChevronDown className="ml-auto size-3.5 text-muted-foreground transition-transform group-not-open/notes:-rotate-90" aria-hidden />
        </summary>
        <AutosaveNotesEditor
          id="query-profile-notes"
          markdown
          variant="document"
          notes={buffer.notes ?? ''}
          onSave={(notes) => props.onSaveNotes(buffer, notes).then(Boolean)}
          placeholder="Write notes in Markdown…"
          scopeKey={`buffer:${buffer.id}`}
        />
      </details>
      <details open={pinCount > 0 || props.pinned?.loadState === 'error'} className="conversation-pins group/pins mt-1">
        <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <Pin className="size-3.5 text-muted-foreground" aria-hidden />
          Pinned messages
          <span className="text-xs tabular-nums text-muted-foreground">{pinCount}</span>
          <ChevronDown className="ml-auto size-3.5 text-muted-foreground transition-transform group-not-open/pins:-rotate-90" aria-hidden />
        </summary>
        <p className="text-[11px] text-muted-foreground">Saved on this device</p>
        {props.pinned ? <PinnedMessagesSidebar {...props.pinned} buffer={buffer} embedded /> : null}
      </details>
    </aside>
  );
}
