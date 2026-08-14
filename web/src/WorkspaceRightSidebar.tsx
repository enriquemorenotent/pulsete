import { memo, type ReactNode } from 'react';
import {
  Info,
  Pin,
  PanelRightClose,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { AiAssistantPanel } from './AiAssistantPanel.js';
import { NicklistPanel, type NicklistPanelProps } from './NicklistPanel.js';
import { QueryProfileSidebar } from './QueryProfileSidebar.js';
import { PinnedMessagesSidebar, type PinnedMessagesLoadState } from './PinnedMessagesSidebar.js';
import { ServerProfileSidebar } from './ServerProfileSidebar.js';
import type { WorkspaceView } from './workspace-types.js';
import type { BufferState, ChatMessage, NetworkProfile } from '../../shared/protocol-chat.js';
import type { AiAssistantSelection } from '../../shared/protocol-ai.js';
import type { AiAssistantStoreApi } from './ai-assistant-store.js';
import type { ServerSidebarAccordionState } from './server-sidebar-accordion-state.js';

export type WorkspaceRightSidebarProps = {
  workspace: WorkspaceView;
  nicklist: Omit<NicklistPanelProps, 'channel' | 'network'>;
  onCollapse?: () => void;
  assistant?: {
    buffer: BufferState | null;
    onSelectionChange?: (selection: AiAssistantSelection) => boolean | Promise<boolean>;
    onUseSuggestion: (value: string) => void;
    selection?: AiAssistantSelection;
    store?: AiAssistantStoreApi;
  };
  serverProfile?: {
    network: WorkspaceView['selectedNetwork'];
    onEdit: () => void;
    onSaveNotes: (
      network: NonNullable<WorkspaceView['selectedNetwork']>,
      notes: string,
    ) => Promise<NetworkProfile | null>;
    accordionState?: ServerSidebarAccordionState;
    onSetAccordionState?: (state: ServerSidebarAccordionState) => void;
  };
  queryProfile?: {
    buffer: BufferState | null;
    pinnedMessages?: ChatMessage[];
    pinnedMessagesLoadState?: PinnedMessagesLoadState;
    onJumpToPinnedMessage?: (bufferId: string, messageId: string) => Promise<boolean>;
    onRetryPinnedMessages?: () => void;
    onSaveNotes: (buffer: BufferState, notes: string) => Promise<BufferState | null>;
    onUnpinMessage?: (bufferId: string, messageId: string) => Promise<boolean>;
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
        accordionState={props.serverProfile?.accordionState}
        onSetAccordionState={props.serverProfile?.onSetAccordionState}
        collapseControl={(
          <RightSidebarCollapseButton onCollapse={props.onCollapse ?? (() => undefined)} />
        )}
      />
    );
  }

  if (isQueryProfileWorkspace(props.workspace)) {
    const buffer = props.queryProfile?.buffer ?? props.workspace.selectedBuffer;
    return (
      <RightSidebarTabs
        key={buffer?.id}
        defaultValue="info"
        onCollapse={props.onCollapse ?? (() => undefined)}
        tabs={[
          {
            icon: Info,
            label: 'Info',
            value: 'info',
            content: (
              <QueryProfileSidebar
                buffer={buffer}
                onSaveNotes={props.queryProfile?.onSaveNotes ?? (async () => null)}
              />
            ),
          },
          {
            icon: Pin,
            label: 'Pinned',
            value: 'pinned',
            content: (
              <PinnedMessagesSidebar
                buffer={buffer}
                messages={props.queryProfile?.pinnedMessages ?? []}
                loadState={props.queryProfile?.pinnedMessagesLoadState ?? 'idle'}
                onJump={props.queryProfile?.onJumpToPinnedMessage ?? (async () => false)}
                onRetry={props.queryProfile?.onRetryPinnedMessages ?? (() => undefined)}
                onUnpin={props.queryProfile?.onUnpinMessage ?? (async () => false)}
              />
            ),
          },
          {
            icon: Sparkles,
            label: 'Assistant',
            value: 'assistant',
            content: (
              <AiAssistantPanel
                buffer={props.assistant?.buffer ?? buffer}
                onSelectionChange={props.assistant?.onSelectionChange}
                onUseSuggestion={props.assistant?.onUseSuggestion ?? (() => undefined)}
                selection={props.assistant?.selection}
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
      onCollapse={props.onCollapse ?? (() => undefined)}
      tabs={[
        {
          icon: Users,
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
              showMedia={props.nicklist.showMedia}
              onSaveNickEmoji={props.nicklist.onSaveNickEmoji}
              onSelectNick={props.nicklist.onSelectNick}
            />
          ),
        },
        {
          icon: Sparkles,
          label: 'Assistant',
          value: 'assistant',
          content: (
            <AiAssistantPanel
              buffer={props.assistant?.buffer ?? props.workspace.selectedBuffer}
              onSelectionChange={props.assistant?.onSelectionChange}
              onUseSuggestion={props.assistant?.onUseSuggestion ?? (() => undefined)}
              selection={props.assistant?.selection}
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
  onCollapse: () => void;
  tabs: Array<{ content: ReactNode; icon: LucideIcon; label: string; value: string }>;
}) {
  return (
    <Tabs defaultValue={props.defaultValue} className="flex h-full min-h-0 flex-col bg-[#15181c]">
      <div className="flex h-12 w-full shrink-0 items-stretch">
        <TabsList
          aria-label="Sidebar views"
          className="flex h-full min-w-0 flex-1 rounded-none border-0 bg-transparent p-0"
        >
          {props.tabs.map((tab) => {
            const TabIcon = tab.icon;
            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                aria-label={tab.label}
                title={tab.label}
                className="h-full min-w-0 flex-1 rounded-none border-0 border-b-2 border-transparent p-0 text-muted-foreground/72 hover:bg-white/[0.025] hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground"
              >
                <TabIcon aria-hidden className="size-4" />
                <span className="sr-only">{tab.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
        <RightSidebarCollapseButton onCollapse={props.onCollapse} />
      </div>
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

function RightSidebarCollapseButton(props: { onCollapse: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="hidden h-12 w-12 shrink-0 rounded-none text-muted-foreground/72 lg:inline-flex"
      aria-label="Collapse right sidebar"
      title="Collapse right sidebar"
      onClick={props.onCollapse}
    >
      <PanelRightClose className="size-4" />
    </Button>
  );
}
