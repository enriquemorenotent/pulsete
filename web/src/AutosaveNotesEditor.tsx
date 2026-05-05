import { useEffect, useRef, useState } from 'react';
import { Label } from '@/components/ui/label.js';

type AutosaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

const autosaveDelayMs = 600;

export function AutosaveNotesEditor(props: {
  id: string;
  notes: string;
  onSave: (notes: string) => Promise<boolean>;
  placeholder: string;
  scopeKey: string;
}) {
  const savedNotes = props.notes;
  const [draftNotes, setDraftNotes] = useState(savedNotes);
  const [autosaveState, setAutosaveState] = useState<AutosaveState>('idle');
  const previousScopeKeyRef = useRef(props.scopeKey);
  const previousSavedNotesRef = useRef(savedNotes);
  const saveVersionRef = useRef(0);
  const onSaveRef = useRef(props.onSave);

  useEffect(() => {
    onSaveRef.current = props.onSave;
  }, [props.onSave]);

  useEffect(() => {
    const previousScopeKey = previousScopeKeyRef.current;
    const previousSavedNotes = previousSavedNotesRef.current;
    previousScopeKeyRef.current = props.scopeKey;
    previousSavedNotesRef.current = savedNotes;

    if (props.scopeKey !== previousScopeKey) {
      saveVersionRef.current += 1;
      setDraftNotes(savedNotes);
      setAutosaveState('idle');
      return;
    }

    setDraftNotes((current) => current === previousSavedNotes ? savedNotes : current);
  }, [props.scopeKey, savedNotes]);

  useEffect(() => {
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
      void onSaveRef.current(draftNotes).then(
        (saved) => {
          if (!cancelled && saveVersionRef.current === saveVersion) {
            setAutosaveState(saved ? 'saved' : 'error');
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
  }, [draftNotes, savedNotes]);

  const statusText = getAutosaveStatusText(autosaveState, draftNotes, savedNotes);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={props.id} className="text-muted-foreground/86">
          Notes
        </Label>
        <span
          aria-live="polite"
          className={`text-[11px] ${
            autosaveState === 'error' ? 'text-destructive' : 'text-muted-foreground/68'
          }`}
        >
          {statusText}
        </span>
      </div>
      <textarea
        id={props.id}
        value={draftNotes}
        onChange={(event) => setDraftNotes(event.target.value)}
        placeholder={props.placeholder}
        className="min-h-40 flex-1 resize-none rounded-sm border border-white/[0.055] bg-white/[0.018] px-2.5 py-2 text-[13px] leading-5 text-foreground/84 outline-none transition-colors placeholder:text-muted-foreground/54 hover:border-white/10 hover:bg-white/[0.026] focus-visible:border-ring/60 focus-visible:bg-white/[0.032] focus-visible:ring-1 focus-visible:ring-ring/35"
      />
    </div>
  );
}

const getAutosaveStatusText = (
  state: AutosaveState,
  draftNotes: string,
  savedNotes: string,
) => {
  if (draftNotes === savedNotes || state === 'saved') {
    return 'Saved';
  }
  if (state === 'error') {
    return 'Save failed';
  }
  return state === 'saving' ? 'Saving' : 'Unsaved';
};
