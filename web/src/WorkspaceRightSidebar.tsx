import { memo, useEffect, useRef, useState } from 'react';
import { AssistantPanel, type AssistantPanelProps } from './AssistantPanel.js';
import { NicklistPanel } from './NicklistPanel.js';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import type { DesktopShellNicklistModel } from './desktop-shell-model.js';
import type { WorkspaceView } from './workspace-types.js';

type WorkspaceRightSidebarProps = {
  workspace: WorkspaceView;
  nicklist: DesktopShellNicklistModel;
  assistant: AssistantPanelProps;
  initialTab?: SidebarTab;
};

type SidebarTab = 'users' | 'assistant';

const isAssistantWorkspace = (workspace: WorkspaceView) =>
  workspace.selectedBuffer?.kind === 'channel' || workspace.selectedBuffer?.kind === 'query';

export const getDefaultSidebarTab = (
  showNicklistTabs: boolean,
  initialTab: SidebarTab = 'users',
): SidebarTab => (showNicklistTabs ? initialTab : 'assistant');

export const resolveSidebarTab = (
  current: SidebarTab,
  showNicklistTabs: boolean,
  previousShowNicklistTabs = showNicklistTabs,
  initialTab: SidebarTab = 'users',
): SidebarTab => {
  if (!showNicklistTabs) {
    return 'assistant';
  }
  if (!previousShowNicklistTabs) {
    return getDefaultSidebarTab(showNicklistTabs, initialTab);
  }
  return current;
};

export const WorkspaceRightSidebar = memo(function WorkspaceRightSidebar(props: WorkspaceRightSidebarProps) {
  const showNicklistTabs = props.workspace.showNicklist && !!props.workspace.selectedChannel;
  const previousShowNicklistTabsRef = useRef(showNicklistTabs);
  const [tab, setTab] = useState<SidebarTab>(() => getDefaultSidebarTab(showNicklistTabs, props.initialTab));

  useEffect(() => {
    const previousShowNicklistTabs = previousShowNicklistTabsRef.current;
    previousShowNicklistTabsRef.current = showNicklistTabs;
    setTab((current) =>
      resolveSidebarTab(current, showNicklistTabs, previousShowNicklistTabs, props.initialTab),
    );
  }, [props.initialTab, showNicklistTabs]);

  if (!isAssistantWorkspace(props.workspace)) {
    return null;
  }

  if (!showNicklistTabs || !props.workspace.selectedChannel) {
    return (
      <div className="h-full px-3 py-4">
        <AssistantPanel {...props.assistant} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-3 py-4">
      <div className="shrink-0 border-b border-white/8">
        <Tabs value={tab} onValueChange={(value) => setTab(value as SidebarTab)}>
          <TabsList className="inline-flex h-auto w-auto gap-4 rounded-none border-0 bg-transparent p-0 text-muted-foreground">
            <TabsTrigger
              value="users"
              className="min-w-0 rounded-none px-0 pb-2 pt-0.5 text-[12px] font-medium tracking-tight hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-[inset_0_-1px_0_rgba(255,255,255,0.72)]"
            >
              Users
            </TabsTrigger>
            <TabsTrigger
              value="assistant"
              className="min-w-0 rounded-none px-0 pb-2 pt-0.5 text-[12px] font-medium tracking-tight hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-[inset_0_-1px_0_rgba(255,255,255,0.72)]"
            >
              Assistant
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'users' ? (
          <NicklistPanel
            network={props.workspace.selectedNetwork}
            channel={props.workspace.selectedChannel}
            friends={props.nicklist.friends}
            mutedNicks={props.nicklist.mutedNicks}
            onAddFriend={props.nicklist.onAddFriend}
            onAddMutedNick={props.nicklist.onAddMutedNick}
            onRemoveFriend={props.nicklist.onRemoveFriend}
            onRemoveMutedNick={props.nicklist.onRemoveMutedNick}
            onSelectNick={props.nicklist.onSelectNick}
          />
        ) : (
          <AssistantPanel {...props.assistant} />
        )}
      </div>
    </div>
  );
});
