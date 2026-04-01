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
    <Tabs defaultValue="notifications" className="space-y-4">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="notifications" className="min-w-0">Notifications</TabsTrigger>
        <TabsTrigger value="assistant" className="min-w-0">Assistant</TabsTrigger>
      </TabsList>

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
