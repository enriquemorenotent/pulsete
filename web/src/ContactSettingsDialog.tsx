import { Bell, Check, Star, VolumeX } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { cn } from '@/lib/utils.js';

type ContactSettingsDialogProps = ContactSettingsDialogBodyProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  networkName: string;
  nick: string;
};

export type ContactSettingsDialogBodyProps = {
  friend: boolean;
  notifications: boolean;
  muted: boolean;
  onFriendChange: (active: boolean) => void;
  onNotificationsChange: (active: boolean) => void;
  onMutedChange: (active: boolean) => void;
};

export function ContactSettingsDialog(props: ContactSettingsDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[min(calc(100vw-1rem),28rem)]">
        <DialogHeader>
          <DialogTitle>Contact</DialogTitle>
          <DialogDescription>
            {props.nick} on {props.networkName}
          </DialogDescription>
        </DialogHeader>
        <ContactSettingsDialogBody
          friend={props.friend}
          notifications={props.notifications}
          muted={props.muted}
          onFriendChange={props.onFriendChange}
          onNotificationsChange={props.onNotificationsChange}
          onMutedChange={props.onMutedChange}
        />
      </DialogContent>
    </Dialog>
  );
}

export function ContactSettingsDialogBody(props: ContactSettingsDialogBodyProps) {
  return (
    <div className="space-y-2">
      <ContactRuleToggle
        active={props.friend}
        icon={<Star className={cn('size-4', props.friend && 'fill-current')} />}
        label="Watchlist"
        onChange={props.onFriendChange}
      />
      <ContactRuleToggle
        active={props.notifications}
        icon={<Bell className={cn('size-4', props.notifications && 'fill-current')} />}
        label="Notifications"
        onChange={props.onNotificationsChange}
      />
      <ContactRuleToggle
        active={props.muted}
        icon={<VolumeX className={cn('size-4', props.muted && 'fill-current')} />}
        label="Muted"
        onChange={props.onMutedChange}
      />
    </div>
  );
}

function ContactRuleToggle(props: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onChange: (active: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.active}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors',
        props.active
          ? 'border-primary/35 bg-primary/10 text-foreground'
          : 'border-white/8 bg-black/14 text-muted-foreground hover:text-foreground',
      )}
      onClick={() => props.onChange(!props.active)}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className={props.active ? 'text-primary' : 'text-muted-foreground'}>
          {props.icon}
        </span>
        <span className="truncate">{props.label}</span>
      </span>
      <span
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border',
          props.active
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-white/14 text-transparent',
        )}
      >
        <Check className="size-3" />
      </span>
    </button>
  );
}
