import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { Input } from '@/components/ui/input.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { cn } from '@/lib/utils.js';
import {
  filterCommandPaletteEntries,
  moveCommandPaletteActiveIndex,
  type CommandPaletteEntry,
  type CommandPaletteEntrySection,
} from './command-palette.js';
import { scheduleAnimationFrameFocus } from './animation-frame-focus.js';

type CommandPaletteDialogProps = {
  open: boolean;
  entries: CommandPaletteEntry[];
  onClose: () => void;
};

export type CommandPaletteDialogBodyProps = {
  activeIndex: number;
  filteredEntries: readonly CommandPaletteEntry[];
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onQueryChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onQueryKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSetActiveIndex: (index: number) => void;
  query: string;
};

const sectionLabels: Record<CommandPaletteEntrySection, string> = {
  buffers: 'Buffers',
  friends: 'Watchlist',
  actions: 'Actions',
};

export function CommandPaletteDialog(props: CommandPaletteDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const filteredEntries = useMemo(
    () => filterCommandPaletteEntries(props.entries, query),
    [props.entries, query],
  );

  useEffect(() => {
    if (!props.open) {
      return;
    }
    setQuery('');
    setActiveIndex(0);
    return scheduleAnimationFrameFocus(window, inputRef);
  }, [props.open]);

  useEffect(() => {
    if (filteredEntries.length === 0) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex((current) => {
      if (current < 0) {
        return 0;
      }
      return Math.min(current, filteredEntries.length - 1);
    });
  }, [filteredEntries.length]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => moveCommandPaletteActiveIndex(current, filteredEntries.length, 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => moveCommandPaletteActiveIndex(current, filteredEntries.length, -1));
      return;
    }
    if (event.key === 'Enter') {
      const entry = filteredEntries[activeIndex];
      if (!entry) {
        return;
      }
      event.preventDefault();
      props.onClose();
      void entry.onSelect();
      return;
    }
    if (event.key === 'Escape') {
      props.onClose();
    }
  };


  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="h-[min(80dvh,32rem)] max-h-[80dvh] gap-0 overflow-hidden p-0 sm:w-[min(calc(100vw-1rem),40rem)]">
        <CommandPaletteDialogBody
          activeIndex={activeIndex}
          filteredEntries={filteredEntries}
          inputRef={inputRef}
          onClose={props.onClose}
          onQueryChange={(event) => setQuery(event.currentTarget.value)}
          onQueryKeyDown={handleKeyDown}
          onSetActiveIndex={setActiveIndex}
          query={query}
        />
      </DialogContent>
    </Dialog>
  );
}

export function CommandPaletteDialogBody(props: CommandPaletteDialogBodyProps) {
  const sections = groupEntriesBySection(props.filteredEntries);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DialogHeader className="shrink-0 border-b border-border px-4 py-3">
        <DialogTitle>Go to…</DialogTitle>
        <DialogDescription>
          Jump between buffers, watched nicks, and common actions with Ctrl/Cmd+K.
        </DialogDescription>
      </DialogHeader>
      <div className="shrink-0 border-b border-border px-4 py-3">
        <Input
          ref={props.inputRef}
          value={props.query}
          onChange={props.onQueryChange}
          onKeyDown={props.onQueryKeyDown}
          placeholder="Search buffers, watchlist, and actions"
          aria-label="Search command palette"
        />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2">
          {props.filteredEntries.length === 0 ? (
            <div className="rounded-sm border border-dashed border-border px-3 py-6 text-center text-[13px] text-muted-foreground">
              No results for this search.
            </div>
          ) : (
            sections.map(({ section, entries }) => (
              <section key={section} className="mb-3 last:mb-0">
                <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {sectionLabels[section]}
                </div>
                <div className="space-y-1">
                  {entries.map(({ entry, index }) => {
                    const active = index === props.activeIndex;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        className={cn(
                          'flex w-full items-start gap-3 rounded-sm border border-transparent px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60',
                          active ? 'border-border bg-accent text-accent-foreground' : 'hover:bg-accent/70',
                        )}
                        data-active={active ? 'true' : undefined}
                        onMouseMove={() => props.onSetActiveIndex(index)}
                        onClick={() => {
                          props.onClose();
                          void entry.onSelect();
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium">
                            <span className="truncate">{entry.label}</span>
                            {entry.emoji ? (
                              <span aria-hidden className="shrink-0 text-[15px] leading-5">
                                {entry.emoji}
                              </span>
                            ) : null}
                          </div>
                          {entry.subtitle ? (
                            <div className="truncate text-[12px] text-muted-foreground">{entry.subtitle}</div>
                          ) : null}
                        </div>
                        {entry.badge ? (
                          <span className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                            {entry.badge}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

const groupEntriesBySection = (entries: readonly CommandPaletteEntry[]) => {
  const sections = new Map<CommandPaletteEntrySection, Array<{ entry: CommandPaletteEntry; index: number }>>();
  entries.forEach((entry, index) => {
    const group = sections.get(entry.section);
    if (group) {
      group.push({ entry, index });
      return;
    }
    sections.set(entry.section, [{ entry, index }]);
  });
  return [...sections.entries()].map(([section, groupedEntries]) => ({
    section,
    entries: groupedEntries,
  }));
};
