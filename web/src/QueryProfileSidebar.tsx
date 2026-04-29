import { useEffect, useRef, useState } from 'react';
import { Label } from '@/components/ui/label.js';
import type { BufferState, NetworkProfile } from '../../shared/protocol.js';

type AutosaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

const autosaveDelayMs = 600;

export function QueryProfileSidebar(props: {
  buffer: BufferState | null;
  network: NetworkProfile | null;
  onSaveNotes: (buffer: BufferState, notes: string) => Promise<BufferState | null>;
}) {
  const buffer = props.buffer;
  const savedNotes = buffer?.notes ?? '';
  const [draftNotes, setDraftNotes] = useState(savedNotes);
  const [autosaveState, setAutosaveState] = useState<AutosaveState>('idle');
  const previousBufferIdRef = useRef(buffer?.id ?? null);
  const previousSavedNotesRef = useRef(savedNotes);
  const saveVersionRef = useRef(0);

  useEffect(() => {
    const previousBufferId = previousBufferIdRef.current;
    const previousSavedNotes = previousSavedNotesRef.current;
    previousBufferIdRef.current = buffer?.id ?? null;
    previousSavedNotesRef.current = savedNotes;

    if (buffer?.id !== previousBufferId) {
      setDraftNotes(savedNotes);
      setAutosaveState('idle');
      return;
    }

    setDraftNotes((current) => current === previousSavedNotes ? savedNotes : current);
  }, [buffer?.id, savedNotes]);

  useEffect(() => {
    if (!buffer) {
      return;
    }
    if (draftNotes === savedNotes) {
      setAutosaveState('idle');
      return;
    }

    const saveVersion = saveVersionRef.current + 1;
    saveVersionRef.current = saveVersion;
    let cancelled = false;
    setAutosaveState('pending');
    const timer = setTimeout(() => {
      setAutosaveState('saving');
      void props.onSaveNotes(buffer, draftNotes).then(
        (updated) => {
          if (!cancelled && saveVersionRef.current === saveVersion) {
            setAutosaveState(updated ? 'saved' : 'error');
          }
        },
        () => {
          if (!cancelled && saveVersionRef.current === saveVersion) {
            setAutosaveState('error');
          }
        },
      );
    }, autosaveDelayMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [buffer?.id, draftNotes, props.onSaveNotes, savedNotes]);

  if (!buffer) {
    return null;
  }

  const statusText = getAutosaveStatusText(autosaveState, draftNotes, savedNotes);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 px-3 py-4">
      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Private message</p>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{buffer.target}</p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {props.network?.name ?? buffer.networkId}
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="query-profile-notes">Notes</Label>
          <span
            aria-live="polite"
            className={`text-[11px] ${autosaveState === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            {statusText}
          </span>
        </div>
        <textarea
          id="query-profile-notes"
          value={draftNotes}
          onChange={(event) => setDraftNotes(event.target.value)}
          placeholder="Character, aliases, plot hooks..."
          className="min-h-40 flex-1 resize-none rounded-sm border border-input bg-input px-3 py-2 text-[13px] leading-5 text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
        />
      </div>
    </div>
  );
}

const getAutosaveStatusText = (state: AutosaveState, draftNotes: string, savedNotes: string) => {
  if (draftNotes === savedNotes) {
    return 'Saved';
  }
  if (state === 'error') {
    return 'Save failed';
  }
  return state === 'saving' ? 'Saving' : 'Unsaved';
};
