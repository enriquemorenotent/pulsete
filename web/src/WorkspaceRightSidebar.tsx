import { memo, type ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { AiAssistantPanel } from './AiAssistantPanel.js';
import { NicklistPanel } from './NicklistPanel.js';
import { QueryProfileSidebar } from './QueryProfileSidebar.js';
import { ServerProfileSidebar } from './ServerProfileSidebar.js';
import type { DesktopShellNicklistModel } from './desktop-shell-model.js';
import type { WorkspaceView } from './workspace-types.js';
import type { BufferState, ChannelUserState, NetworkProfile } from '../../shared/protocol-chat.js';
import type { AiAssistantStoreApi } from './ai-assistant-store.js';

type QueryProfileAvatarUser = Pick<ChannelUserState, 'host' | 'nick' | 'username'> & {
  ircCloudAvatarId?: string | null;
};

type WorkspaceRightSidebarProps = {
  workspace: WorkspaceView;
  nicklist: DesktopShellNicklistModel;
  assistant?: {
    buffer: BufferState | null;
    onUseSuggestion: (value: string) => void;
    store?: AiAssistantStoreApi;
  };
  serverProfile?: {
    network: WorkspaceView['selectedNetwork'];
    onEdit: () => void;
    onSaveNotes: (
      network: NonNullable<WorkspaceView['selectedNetwork']>,
      notes: string,
    ) => Promise<NetworkProfile | null>;
  };
  queryProfile?: {
    avatarUser?: QueryProfileAvatarUser | null;
    buffer: BufferState | null;
    externalAvatarsEnabled?: boolean;
    profileImagesVisible?: boolean;
    onSaveNotes: (buffer: BufferState, notes: string) => Promise<BufferState | null>;
  };
};

const isServerProfileWorkspace = (workspace: WorkspaceView) =>
  workspace.selectedBuffer?.kind === 'server';

const isQueryProfileWorkspace = (workspace: WorkspaceView) =>
  workspace.selectedBuffer?.kind === 'query';

export const WorkspaceRightSidebar = memo(function WorkspaceRightSidebar(props: WorkspaceRightSidebarProps) {
  if (isServerProfileWorkspace(props.workspace)) {
    return (
      <ServerProfileSidebar
        network={props.serverProfile?.network ?? null}
        fallbackNetwork={props.workspace.selectedNetwork}
        runtime={props.workspace.selectedRuntime}
        onEdit={props.serverProfile?.onEdit ?? (() => undefined)}
        onSaveNotes={props.serverProfile?.onSaveNotes ?? (async () => null)}
      />
    );
  }

  if (isQueryProfileWorkspace(props.workspace)) {
    const buffer = props.queryProfile?.buffer ?? props.workspace.selectedBuffer;
    return (
      <RightSidebarTabs
        key={buffer?.id}
        defaultValue="info"
        tabs={[
          {
            label: 'Info',
            value: 'info',
            content: (
              <QueryProfileSidebar
                avatarUser={props.queryProfile?.avatarUser ?? null}
                buffer={buffer}
                externalAvatarsEnabled={
                  props.queryProfile?.externalAvatarsEnabled ?? props.nicklist.externalAvatarsEnabled
                }
                profileImagesVisible={props.queryProfile?.profileImagesVisible}
                onSaveNotes={props.queryProfile?.onSaveNotes ?? (async () => null)}
              />
            ),
          },
          {
            label: 'Assistant',
            value: 'assistant',
            content: (
              <AiAssistantPanel
                buffer={props.assistant?.buffer ?? buffer}
                onUseSuggestion={props.assistant?.onUseSuggestion ?? (() => undefined)}
                store={props.assistant?.store}
              />
            ),
          },
        ]}
      />
    );
  }

  if (!props.workspace.showNicklist || !props.workspace.selectedChannel) {
    return null;
  }

  return (
    <RightSidebarTabs
      key={props.workspace.selectedChannel.id}
      defaultValue="members"
      tabs={[
        {
          label: 'Members',
          value: 'members',
          content: (
            <NicklistPanel
              network={props.workspace.selectedNetwork}
              channel={props.workspace.selectedChannel}
              friends={props.nicklist.friends}
              mutedNicks={props.nicklist.mutedNicks}
              nickEmojis={props.nicklist.nickEmojis}
              contactNotificationSettings={props.nicklist.contactNotificationSettings}
              contactRuleHandlers={props.nicklist.contactRuleHandlers}
              externalAvatarsEnabled={props.nicklist.externalAvatarsEnabled}
              mediaPolicy={props.nicklist.mediaPolicy}
              onSaveNickEmoji={props.nicklist.onSaveNickEmoji}
              onSelectNick={props.nicklist.onSelectNick}
            />
          ),
        },
        {
          label: 'Assistant',
          value: 'assistant',
          content: (
            <AiAssistantPanel
              buffer={props.assistant?.buffer ?? props.workspace.selectedBuffer}
              onUseSuggestion={props.assistant?.onUseSuggestion ?? (() => undefined)}
              store={props.assistant?.store}
            />
          ),
        },
      ]}
    />
  );
});

function RightSidebarTabs(props: {
  defaultValue: string;
  tabs: Array<{ content: ReactNode; label: string; value: string }>;
}) {
  return (
    <Tabs defaultValue={props.defaultValue} className="flex h-full min-h-0 flex-col">
      <TabsList className="grid h-11 w-full shrink-0 grid-cols-2 rounded-none border-x-0 border-t-0 border-b border-white/[0.055] bg-transparent p-0">
        {props.tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className="h-full min-w-0 rounded-none border-b-2 border-transparent bg-transparent px-4 py-0 text-[12px] text-muted-foreground/72 data-[state=active]:border-primary/70 data-[state=active]:bg-white/[0.025] data-[state=active]:text-foreground/92"
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {props.tabs.map((tab) => (
        <TabsContent
          key={tab.value}
          forceMount
          value={tab.value}
          className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
