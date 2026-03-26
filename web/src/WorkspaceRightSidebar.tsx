import { memo, useEffect, useState } from 'react';
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

export const resolveSidebarTab = (current: SidebarTab, showNicklistTabs: boolean): SidebarTab =>
  showNicklistTabs ? current : 'assistant';

export const WorkspaceRightSidebar = memo(function WorkspaceRightSidebar(props: WorkspaceRightSidebarProps) {
  const showNicklistTabs = props.workspace.showNicklist && !!props.workspace.selectedChannel;
  const [tab, setTab] = useState<SidebarTab>(() => getDefaultSidebarTab(showNicklistTabs, props.initialTab));

  useEffect(() => {
    setTab((current) => resolveSidebarTab(current, showNicklistTabs));
  }, [showNicklistTabs]);

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
      <Tabs value={tab} onValueChange={(value) => setTab(value as SidebarTab)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="users" className="min-w-0">Users</TabsTrigger>
          <TabsTrigger value="assistant" className="min-w-0">Assistant</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="min-h-0 flex-1">
        {tab === 'users' ? (
          <NicklistPanel
            network={props.workspace.selectedNetwork}
            channel={props.workspace.selectedChannel}
            friends={props.nicklist.friends}
            onAddFriend={props.nicklist.onAddFriend}
            onRemoveFriend={props.nicklist.onRemoveFriend}
            onSelectNick={props.nicklist.onSelectNick}
          />
        ) : (
          <AssistantPanel {...props.assistant} />
        )}
      </div>
    </div>
  );
});
