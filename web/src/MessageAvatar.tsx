import { cn } from '@/lib/utils.js';

type MessageAvatarProps = {
  nick: string;
  className?: string;
};

export function MessageAvatar(props: MessageAvatarProps) {
  const initials = getMessageAvatarInitials(props.nick);
  const color = buildAvatarColor(hashNick(props.nick));

  return (
    <div
      aria-hidden="true"
      data-message-avatar={initials}
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-full border text-center shadow-[0_6px_18px_-14px_rgba(0,0,0,0.85)]',
        props.className
      )}
      style={{
        backgroundColor: color.backgroundColor,
        borderColor: color.borderColor,
        color: color.textColor,
      }}
    >
      <span className="font-mono text-[13px] font-semibold uppercase tracking-[0.08em]">
        {initials}
      </span>
    </div>
  );
}

export const getMessageAvatarInitials = (nick: string) => {
  const trimmed = nick.trim();
  if (!trimmed) {
    return '?';
  }
  const letters = Array.from(trimmed).filter((character) => /[\p{L}\p{N}]/u.test(character));
  const source = letters.length > 0 ? letters : Array.from(trimmed);
  return source.slice(0, 2).join('').toUpperCase();
};

const hashNick = (nick: string) =>
  Array.from(nick).reduce((hash, character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (hash * 33 + codePoint) | 0;
  }, 17);

const buildAvatarColor = (hash: number) => {
  const hue = Math.abs(hash) % 360;
  return {
    backgroundColor: `hsl(${hue} 26% 23%)`,
    borderColor: `hsl(${hue} 32% 38% / 0.55)`,
    textColor: `hsl(${hue} 62% 90%)`,
  };
};
