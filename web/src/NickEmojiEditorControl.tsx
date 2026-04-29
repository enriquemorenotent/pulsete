import { useEffect, useRef, useState } from 'react';
import { Check, Smile, X } from 'lucide-react';
import { cn } from '@/lib/utils.js';

export const nickEmojiTagOptions = [
  { emoji: '✅', label: 'Worth talking' },
  { emoji: '💬', label: 'Good conversation' },
  { emoji: '🧠', label: 'Insightful' },
  { emoji: '🤝', label: 'Friendly' },
  { emoji: '🎭', label: 'Roleplay' },
  { emoji: '👀', label: 'Watch first' },
  { emoji: '😐', label: 'Neutral' },
  { emoji: '⏳', label: 'Later' },
  { emoji: '🤐', label: 'Quiet' },
  { emoji: '⚠️', label: 'Caution' },
  { emoji: '🚫', label: 'Avoid' },
  { emoji: '❓', label: 'Unknown' },
];

type NickEmojiEditorControlProps = {
  emoji: string | null;
  nick: string;
  onSave: (emoji: string | null) => Promise<boolean>;
};

export function NickEmojiEditorControl(props: NickEmojiEditorControlProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const saveEmoji = async (nextEmoji: string | null) => {
    if (saving) {
      return;
    }
    if (nextEmoji === props.emoji) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      if (await props.onSave(nextEmoji)) {
        setOpen(false);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={pickerRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        className={cn(
          'inline-flex size-7 shrink-0 items-center justify-center rounded-sm border text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60',
          props.emoji ? 'border-primary/25 bg-primary/10 text-primary hover:text-primary' : 'border-transparent',
        )}
        aria-label={`Edit emoji tag for ${props.nick}`}
        aria-expanded={open}
        aria-haspopup="menu"
        title={`Edit emoji tag for ${props.nick}`}
        onClick={() => setOpen((current) => !current)}
      >
        {props.emoji ? (
          <span aria-hidden className="text-[15px] leading-none">
            {props.emoji}
          </span>
        ) : (
          <Smile className="size-4" />
        )}
      </button>
      {open ? (
        <NickEmojiPickerMenu
          emoji={props.emoji}
          nick={props.nick}
          saving={saving}
          onSelect={(emoji) => void saveEmoji(emoji)}
        />
      ) : null}
    </div>
  );
}

type NickEmojiPickerMenuProps = {
  emoji: string | null;
  nick: string;
  saving?: boolean;
  onSelect: (emoji: string | null) => void;
};

export function NickEmojiPickerMenu(props: NickEmojiPickerMenuProps) {
  return (
    <div
      role="menu"
      aria-label={`Emoji tags for ${props.nick}`}
      className="absolute right-0 top-full z-40 mt-2 w-44 rounded-md border border-white/10 bg-popover p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.38)]"
    >
      <div className="grid grid-cols-4 gap-1">
        {nickEmojiTagOptions.map((option) => (
          <button
            key={option.emoji}
            type="button"
            role="menuitemradio"
            aria-checked={props.emoji === option.emoji}
            aria-label={`${option.label} emoji tag for ${props.nick}`}
            title={option.label}
            disabled={props.saving}
            className={cn(
              'relative flex size-9 items-center justify-center rounded-sm text-[17px] leading-none transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-60',
              props.emoji === option.emoji && 'bg-primary/12 text-primary',
            )}
            onClick={() => props.onSelect(option.emoji)}
          >
            <span aria-hidden>{option.emoji}</span>
            {props.emoji === option.emoji ? (
              <Check className="absolute right-0.5 top-0.5 size-3 text-primary" />
            ) : null}
          </button>
        ))}
      </div>
      <button
        type="button"
        role="menuitem"
        aria-label={`Clear emoji tag for ${props.nick}`}
        title="Clear"
        disabled={props.saving}
        className="mt-1 flex h-8 w-full items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-60"
        onClick={() => props.onSelect(null)}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
