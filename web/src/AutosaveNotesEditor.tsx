import { useEffect, useRef, useState } from 'react';
import { Label } from '@/components/ui/label.js';
import { cn } from '@/lib/utils.js';

type AutosaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
type NotesEditorVariant = 'default' | 'compact';

const autosaveDelayMs = 600;

export function AutosaveNotesEditor(props: {
  id: string;
  notes: string;
  onSave: (notes: string) => Promise<boolean>;
  placeholder: string;
  scopeKey: string;
  variant?: NotesEditorVariant;
}) {
  const savedNotes = props.notes;
  const variant = props.variant ?? 'default';
  const showHeader = variant === 'default';
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
  const showCompactStatus = !showHeader && statusText !== 'Saved';

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', showHeader ? 'gap-2' : 'gap-0')}>
      {showHeader ? (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={props.id} className="text-muted-foreground/86">
            Notes
          </Label>
          <AutosaveStatus state={autosaveState} statusText={statusText} />
        </div>
      ) : showCompactStatus ? null : (
        <span aria-live="polite" className="sr-only">
          {statusText}
        </span>
      )}
      <div className={cn('relative flex-1', showHeader ? 'min-h-40' : 'min-h-32')}>
        <textarea
          id={props.id}
          aria-label={showHeader ? undefined : 'Notes'}
          value={draftNotes}
          onChange={(event) => setDraftNotes(event.target.value)}
          placeholder={props.placeholder}
          className={cn(
            'h-full min-h-full w-full resize-none rounded-sm outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring/35',
            showHeader
              ? 'border border-white/[0.055] bg-white/[0.018] px-2.5 py-2 text-[13px] leading-5 text-foreground/84 placeholder:text-muted-foreground/54 hover:border-white/10 hover:bg-white/[0.026] focus-visible:border-ring/60 focus-visible:bg-white/[0.032]'
              : 'border border-white/[0.04] bg-black/10 py-1.5 pl-2 pr-16 text-[12px] leading-5 text-foreground/78 placeholder:text-muted-foreground/50 hover:border-white/8 hover:bg-black/15 focus-visible:border-ring/50 focus-visible:bg-black/12',
          )}
        />
        {showCompactStatus ? (
          <div className="pointer-events-none absolute right-2 top-2 rounded-sm border border-white/[0.06] bg-background/90 px-1.5 py-0.5 shadow-[0_4px_14px_rgba(0,0,0,0.24)]">
            <AutosaveStatus state={autosaveState} statusText={statusText} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AutosaveStatus(props: { state: AutosaveState; statusText: string }) {
  return (
    <span
      aria-live="polite"
      className={cn(
        'text-[11px] leading-none',
        props.state === 'error' ? 'text-destructive' : 'text-muted-foreground/68',
      )}
    >
      {props.statusText}
    </span>
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
