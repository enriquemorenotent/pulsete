import type { AssistantSnapshot, MutedNickState, NetworkProfile } from '../../shared/protocol.js';
import type {
  BackgroundDmAudioContact,
  BackgroundDmAudioSettings,
} from './background-dm-audio.js';
import { PreferencesAssistantPanel } from './PreferencesAssistantPanel.js';
import { PreferencesNotificationsPanel } from './PreferencesNotificationsPanel.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';

export type PreferencesDialogBodyProps = {
  assistant: AssistantSnapshot;
  backgroundDmAudio: BackgroundDmAudioSettings;
  mutedNicks: MutedNickState[];
  networks: NetworkProfile[];
  onStartLogin: () => Promise<unknown>;
  onCancelLogin: (loginId: string) => Promise<unknown>;
  onLogout: () => Promise<unknown>;
  onChangeModel: (model: string) => Promise<unknown>;
  onSetBackgroundDmAudioEnabled: (enabled: boolean) => void;
  backgroundDmAudioSystemPermission: NotificationPermission | 'unsupported';
  onSetBackgroundDmAudioSystemEnabled: (enabled: boolean) => void;
  onRequestBackgroundDmAudioSystemPermission: () => Promise<
    NotificationPermission | 'unsupported'
  >;
  onSetBackgroundDmAudioSound: (sound: BackgroundDmAudioSettings['sound']) => void;
  onPreviewBackgroundDmAudioSound: (sound: BackgroundDmAudioSettings['sound']) => void;
  onRemoveBackgroundDmAudioContact: (contact: BackgroundDmAudioContact) => void;
  onRemoveMutedNick: (mutedNickId: string) => Promise<boolean>;
};

export function PreferencesDialogBody(props: PreferencesDialogBodyProps) {
  return (
    <Tabs defaultValue="notifications" className="flex flex-col gap-4">
      <div className="-mx-4 shrink-0 border-b border-white/6 px-4">
        <TabsList className="inline-flex h-auto w-auto gap-4 rounded-none border-0 bg-transparent p-0 text-muted-foreground">
          <TabsTrigger
            value="notifications"
            className="min-w-0 rounded-none px-0 pb-2 pt-0.5 text-[12px] font-medium tracking-tight hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-[inset_0_-1px_0_rgba(255,255,255,0.72)]"
          >
            Notifications
          </TabsTrigger>
          <TabsTrigger
            value="assistant"
            className="min-w-0 rounded-none px-0 pb-2 pt-0.5 text-[12px] font-medium tracking-tight hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-[inset_0_-1px_0_rgba(255,255,255,0.72)]"
          >
            Assistant
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="notifications" forceMount className="mt-0 data-[state=inactive]:hidden">
        <PreferencesNotificationsPanel
          backgroundDmAudio={props.backgroundDmAudio}
          mutedNicks={props.mutedNicks}
          networks={props.networks}
          onSetBackgroundDmAudioEnabled={props.onSetBackgroundDmAudioEnabled}
          backgroundDmAudioSystemPermission={props.backgroundDmAudioSystemPermission}
          onSetBackgroundDmAudioSystemEnabled={props.onSetBackgroundDmAudioSystemEnabled}
          onRequestBackgroundDmAudioSystemPermission={props.onRequestBackgroundDmAudioSystemPermission}
          onSetBackgroundDmAudioSound={props.onSetBackgroundDmAudioSound}
          onPreviewBackgroundDmAudioSound={props.onPreviewBackgroundDmAudioSound}
          onRemoveBackgroundDmAudioContact={props.onRemoveBackgroundDmAudioContact}
          onRemoveMutedNick={props.onRemoveMutedNick}
        />
      </TabsContent>

      <TabsContent value="assistant" forceMount className="mt-0 data-[state=inactive]:hidden">
        <PreferencesAssistantPanel
          assistant={props.assistant}
          onStartLogin={props.onStartLogin}
          onCancelLogin={props.onCancelLogin}
          onLogout={props.onLogout}
          onChangeModel={props.onChangeModel}
        />
      </TabsContent>
    </Tabs>
  );
}
