import { useId } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { Checkbox } from '@/components/ui/checkbox.js';

export type NotificationPermissionState = NotificationPermission | 'unsupported';

const notificationPermissionCopy: Record<NotificationPermissionState, string> = {
  default: 'Permission not granted yet. Allow notifications in the browser first.',
  denied: 'Notifications are blocked in browser site settings.',
  granted: 'Permission granted.',
  unsupported: 'This browser does not support system notifications.',
};

type PreferencesNotificationSystemSectionProps = {
  enabled: boolean;
  permission: NotificationPermissionState;
  onRequestPermission: () => Promise<NotificationPermissionState>;
  onSetEnabled: (enabled: boolean) => void;
};

export function PreferencesNotificationSystemSection(
  props: PreferencesNotificationSystemSectionProps,
) {
  const systemEnabledId = useId();
  return (
    <div className="flex items-start gap-3 py-4">
      <Bell aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-1">
        <label htmlFor={systemEnabledId} className="cursor-pointer text-sm font-medium">Desktop notifications</label>
        <p className="text-xs text-muted-foreground">Messages and watchlist presence while Pulsete is in the background.</p>
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
          <span>{notificationPermissionCopy[props.permission]}</span>
          {props.permission === 'default' ? <Button variant="outline" size="sm" onClick={async () => {
            const permission = await props.onRequestPermission();
            if (permission === 'granted') props.onSetEnabled(true);
          }}>Allow in Browser</Button> : null}
        </div>
      </div>
      <Checkbox id={systemEnabledId} checked={props.enabled} disabled={props.permission !== 'granted'} onCheckedChange={(checked) => props.onSetEnabled(checked === true)} aria-label="Show system notifications for allowed conversations and watchlist presence" />
    </div>
  );
}
