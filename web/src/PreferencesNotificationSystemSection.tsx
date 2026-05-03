import { useId } from 'react';
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
    <div className="space-y-3 rounded-md border border-white/6 bg-black/14 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Show system notifications</p>
          <p className="text-muted-foreground">
            Show OS-level alerts when an allowed private-message contact writes while this app is in the background.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-white/16 hover:text-foreground">
          <Checkbox
            id={systemEnabledId}
            checked={props.enabled}
            disabled={props.permission !== 'granted'}
            onCheckedChange={(checked) => props.onSetEnabled(checked === true)}
            aria-label="Show system notifications for allowed private messages"
          />
          <label htmlFor={systemEnabledId} className="cursor-pointer">System</label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
        <span>{notificationPermissionCopy[props.permission]}</span>
        {props.permission === 'default' ? (
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const permission = await props.onRequestPermission();
              if (permission === 'granted') {
                props.onSetEnabled(true);
              }
            }}
          >
            Allow in Browser
          </Button>
        ) : null}
      </div>
    </div>
  );
}
