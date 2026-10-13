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
  return (
    <aside aria-label="Conversation context" className="h-full overflow-y-auto overscroll-contain px-4 py-3">
      <details open className="group/notes border-b border-white/[0.07] pb-4">
        <summary className="flex cursor-pointer list-none items-center gap-2 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <NotebookPen className="size-3.5 text-muted-foreground" aria-hidden />
          Notes
          <ChevronDown className="ml-auto size-3.5 text-muted-foreground transition-transform group-not-open/notes:-rotate-90" aria-hidden />
        </summary>
        <AutosaveNotesEditor
          id="query-profile-notes"
          fill={false}
          variant="document"
          notes={buffer.notes ?? ''}
          onSave={(notes) => props.onSaveNotes(buffer, notes).then(Boolean)}
          placeholder="Add details you want to remember…"
          scopeKey={buffer.id}
        />
      </details>
      <details open className="group/pins pt-3">
        <summary className="flex cursor-pointer list-none items-center gap-2 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <Pin className="size-3.5 text-muted-foreground" aria-hidden />
          Pinned messages
          <span className="text-xs tabular-nums text-muted-foreground">{props.pinned?.messages.length ?? 0}</span>
          <ChevronDown className="ml-auto size-3.5 text-muted-foreground transition-transform group-not-open/pins:-rotate-90" aria-hidden />
        </summary>
        <p className="text-[11px] text-muted-foreground">Saved on this device</p>
        {props.pinned ? <PinnedMessagesSidebar {...props.pinned} buffer={buffer} embedded /> : null}
      </details>
    </aside>
  );
}
