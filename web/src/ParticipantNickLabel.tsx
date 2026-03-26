import { cn } from '@/lib/utils.js';

type ParticipantNickLabelProps = {
  nick: string;
  className?: string;
  clickable?: boolean;
  onOpenParticipantQuery?: (nick: string) => void;
};

export function ParticipantNickLabel(props: ParticipantNickLabelProps) {
  if (props.clickable && props.onOpenParticipantQuery) {
    return (
      <button
        type="button"
        aria-label={`Open private message with ${props.nick}`}
        className={cn(
          'cursor-pointer appearance-none border-0 bg-transparent p-0 align-baseline text-left transition-opacity hover:opacity-85 hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60',
          props.className,
        )}
        onClick={() => props.onOpenParticipantQuery?.(props.nick)}
      >
        {props.nick}
      </button>
    );
  }

  return <span className={props.className}>{props.nick}</span>;
}
