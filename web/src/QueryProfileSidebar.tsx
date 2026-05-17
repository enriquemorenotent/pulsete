import type { BufferState } from '../../shared/protocol-chat.js';
import { AutosaveNotesEditor } from './AutosaveNotesEditor.js';
import { InspectorPanel } from './RightSidebarInspector.js';

export function QueryProfileSidebar(props: {
  buffer: BufferState | null;
  onSaveNotes: (buffer: BufferState, notes: string) => Promise<BufferState | null>;
}) {
  const buffer = props.buffer;

  if (!buffer) {
    return null;
  }

  return (
    <InspectorPanel>
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
