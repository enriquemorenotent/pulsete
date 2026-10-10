import { Bell, Image, Sparkles, Archive, Wrench } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import type { MutedNickState, NetworkProfile } from '../../shared/protocol-chat.js';
import type {
  ContactNotificationChannel,
  ContactNotificationContact,
  ContactNotificationSettings,
} from './contact-notifications/settings.js';
import { PreferencesAvatarSection } from './PreferencesAvatarSection.js';
import { PreferencesAiSection } from './PreferencesAiSection.js';
import { PreferencesBackupSection } from './PreferencesBackupSection.js';
import { PreferencesMediaSection } from './PreferencesMediaSection.js';
import { PreferencesNotificationsPanel } from './PreferencesNotificationsPanel.js';
import type { MediaVisibilitySettings } from './media-visibility-settings.js';
import type { UserAvatarSettings } from './user-avatars/settings.js';

export type PreferencesDialogBodyProps = {
  developerMode: boolean;
  onSetDeveloperMode: (enabled: boolean) => void;
  contactNotifications: ContactNotificationSettings;
  mediaVisibilitySettings: MediaVisibilitySettings;
  userAvatarSettings: UserAvatarSettings;
  mutedNicks: MutedNickState[];
  networks: NetworkProfile[];
  onSetContactNotificationSoundEnabled: (enabled: boolean) => void;
  contactNotificationSystemPermission: NotificationPermission | 'unsupported';
  onSetContactNotificationSystemEnabled: (enabled: boolean) => void;
  onRequestContactNotificationSystemPermission: () => Promise<
    NotificationPermission | 'unsupported'
  >;
  onSetContactNotificationSound: (sound: ContactNotificationSettings['sound']) => void;
  onPreviewContactNotificationSound: (sound: ContactNotificationSettings['sound']) => void;
  onRemoveContactNotificationChannel: (channel: ContactNotificationChannel) => void;
  onRemoveContactNotificationContact: (contact: ContactNotificationContact) => void;
  onRemoveMutedNick: (mutedNickId: string) => Promise<boolean>;
  onSetMediaVisibilityMode: (mode: MediaVisibilitySettings['mode']) => void;
  onSetExternalAvatarsEnabled: (enabled: boolean) => void;
  onExportBackup: () => Promise<void>;
  onImportBackup: (file: Blob) => Promise<void>;
};

const categories = [
  { value: 'display', label: 'Display', icon: Image },
  { value: 'notifications', label: 'Notifications', icon: Bell },
  { value: 'ai', label: 'AI assistant', icon: Sparkles },
  { value: 'backup', label: 'Backup', icon: Archive },
  { value: 'advanced', label: 'Advanced', icon: Wrench },
];

export function PreferencesDialogBody(props: PreferencesDialogBodyProps) {
  return (
    <Tabs defaultValue="display" orientation="vertical" className="flex h-full min-h-0 min-w-0 flex-col sm:flex-row">
      <TabsList aria-label="Settings categories" className="flex h-auto w-full min-w-0 shrink-0 justify-start gap-1 overflow-x-auto rounded-none border-0 border-b border-border bg-card p-3 sm:w-44 sm:flex-col sm:items-stretch sm:border-b-0 sm:border-r">
        {categories.map(({ value, label, icon: Icon }) => (
          <TabsTrigger key={value} value={value} className="min-w-0 shrink-0 justify-start gap-2 rounded-lg px-3 py-3 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
            <Icon className="size-4 shrink-0" />{label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="display" className="m-0 min-h-0 min-w-0 flex-1 space-y-8 overflow-y-auto p-6">
      <PreferencesMediaSection
        mode={props.mediaVisibilitySettings.mode}
        onSetMode={props.onSetMediaVisibilityMode}
      />
      <PreferencesAvatarSection
        settings={props.userAvatarSettings}
        onSetExternalAvatarsEnabled={props.onSetExternalAvatarsEnabled}
      />
      </TabsContent>
      <TabsContent value="ai" className="m-0 min-h-0 min-w-0 flex-1 overflow-y-auto p-6"><PreferencesAiSection /></TabsContent>
      <TabsContent value="notifications" className="m-0 min-h-0 min-w-0 flex-1 overflow-y-auto p-6">
      <PreferencesNotificationsPanel
        contactNotifications={props.contactNotifications}
        mutedNicks={props.mutedNicks}
        networks={props.networks}
        onSetContactNotificationSoundEnabled={props.onSetContactNotificationSoundEnabled}
        contactNotificationSystemPermission={props.contactNotificationSystemPermission}
        onSetContactNotificationSystemEnabled={props.onSetContactNotificationSystemEnabled}
        onRequestContactNotificationSystemPermission={props.onRequestContactNotificationSystemPermission}
        onSetContactNotificationSound={props.onSetContactNotificationSound}
        onPreviewContactNotificationSound={props.onPreviewContactNotificationSound}
        onRemoveContactNotificationChannel={props.onRemoveContactNotificationChannel}
        onRemoveContactNotificationContact={props.onRemoveContactNotificationContact}
        onRemoveMutedNick={props.onRemoveMutedNick}
      />
      </TabsContent>
      <TabsContent value="backup" className="m-0 min-h-0 min-w-0 flex-1 overflow-y-auto p-6">
      <PreferencesBackupSection
        onExportBackup={props.onExportBackup}
        onImportBackup={props.onImportBackup}
      />
      </TabsContent>
      <TabsContent value="advanced" className="m-0 min-h-0 min-w-0 flex-1 overflow-y-auto p-6">
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Developer tools</h3>
          <label className="flex items-start justify-between gap-4 rounded-lg bg-secondary/50 p-4">
            <span className="space-y-1">
              <span className="block text-sm font-medium">Developer mode</span>
              <span className="block text-sm text-muted-foreground">Show memory diagnostics in the toolbar for troubleshooting.</span>
            </span>
            <Checkbox aria-label="Developer mode" checked={props.developerMode} onCheckedChange={(checked) => props.onSetDeveloperMode(checked === true)} />
          </label>
        </section>
      </TabsContent>
    </Tabs>
  );
}
