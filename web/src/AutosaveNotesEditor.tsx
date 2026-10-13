import { useEffect, useRef, useState } from 'react';
import { Label } from '@/components/ui/label.js';
import { cn } from '@/lib/utils.js';

type AutosaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
type NotesEditorVariant = 'default' | 'compact' | 'document';

const autosaveDelayMs = 600;

export function AutosaveNotesEditor(props: {
  fill?: boolean;
  id: string;
  notes: string;
  onSave: (notes: string) => Promise<boolean>;
  placeholder: string;
  scopeKey: string;
  variant?: NotesEditorVariant;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [recentlySaved, setRecentlySaved] = useState(false);
  const savedFeedbackRef = useRef({ scope: props.scopeKey, notes: props.notes });
  const savedNotes = props.notes;
  const fill = props.fill ?? true;
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

  useEffect(() => {
    const previous = savedFeedbackRef.current;
    savedFeedbackRef.current = { scope: props.scopeKey, notes: savedNotes };
    setRecentlySaved(previous.scope === props.scopeKey && previous.notes !== savedNotes);
    const timer = setTimeout(() => setRecentlySaved(false), 2_000);
    return () => clearTimeout(timer);
  }, [props.scopeKey, savedNotes]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (variant !== 'document' || !textarea) return;
    const resize = () => {
      if (textarea.clientWidth === 0) return;
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    };
    resize();
    let previousWidth = textarea.clientWidth;
    const observer = new ResizeObserver(() => {
      if (textarea.clientWidth !== previousWidth) {
        previousWidth = textarea.clientWidth;
        resize();
      }
    });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [draftNotes, variant]);

  const statusText = getAutosaveStatusText(autosaveState, draftNotes, savedNotes);
  const showCompactStatus = !showHeader && (statusText !== 'Saved' || (variant === 'document' && recentlySaved));

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col',
        fill && 'flex-1',
        showHeader ? 'gap-2.5' : 'gap-0',
      )}
    >
      {showHeader ? (
        <div className="flex items-center justify-between gap-2">
          <Label
            htmlFor={props.id}
            className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/74"
          >
            Notes
          </Label>
          <AutosaveStatus state={autosaveState} statusText={statusText} />
        </div>
      ) : showCompactStatus ? null : (
        <span aria-live="polite" className="sr-only">
          {statusText}
        </span>
      )}
      <div
        className={cn(
          'relative',
          fill ? 'flex-1' : '',
          showHeader ? fill && 'min-h-40' : 'min-h-32',
        )}
      >
        <textarea
          ref={textareaRef}
          id={props.id}
          aria-label={showHeader ? undefined : 'Notes'}
          value={draftNotes}
          onChange={(event) => setDraftNotes(event.target.value)}
          placeholder={props.placeholder}
          className={cn(
            'w-full outline-none transition-colors',
            variant === 'document' ? 'min-h-24 resize-none overflow-hidden' : fill ? 'h-full min-h-full resize-none' : 'h-[min(32dvh,18rem)] min-h-32 resize-y',
            variant === 'document'
              ? 'rounded-sm border border-transparent bg-transparent px-1 py-2 text-[13px] leading-6 text-foreground/90 placeholder:text-muted-foreground focus-visible:border-ring/50'
              : showHeader
              ? 'rounded-lg border border-white/[0.07] bg-black/15 px-3 py-2.5 text-[13px] leading-5 text-foreground/84 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] placeholder:text-muted-foreground hover:border-white/12 hover:bg-black/20 focus-visible:border-ring/60 focus-visible:bg-black/20'
              : 'rounded-sm border border-white/[0.04] bg-black/10 py-1.5 pl-2 pr-16 text-[12px] leading-5 text-foreground/78 placeholder:text-muted-foreground/50 hover:border-white/8 hover:bg-black/15 focus-visible:border-ring/50 focus-visible:bg-black/12',
          )}
        />
        {showCompactStatus ? (
          <div className={variant === 'document' ? 'text-right' : 'pointer-events-none absolute right-2 top-2 rounded-sm border border-white/[0.06] bg-background/90 px-1.5 py-0.5 shadow-[0_4px_14px_rgba(0,0,0,0.24)]'}>
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
        props.state === 'error' ? 'text-destructive' : 'text-muted-foreground',
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
