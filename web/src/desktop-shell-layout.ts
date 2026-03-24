export type CompactWorkspacePane = 'browse' | 'chat' | 'assistant';

type ResolveCompactWorkspacePaneParams = {
  current: CompactWorkspacePane;
  selectedBufferId: string | null;
  previousSelectedBufferId: string | null;
  showAssistantPane: boolean;
};

export const getDefaultCompactWorkspacePane = (
  selectedBufferId: string | null,
): CompactWorkspacePane => (selectedBufferId ? 'chat' : 'browse');

export const resolveCompactWorkspacePane = ({
  current,
  selectedBufferId,
  previousSelectedBufferId,
  showAssistantPane,
}: ResolveCompactWorkspacePaneParams): CompactWorkspacePane => {
  if (!selectedBufferId) {
    return 'browse';
  }
  if (current === 'browse' && previousSelectedBufferId !== selectedBufferId) {
    return 'chat';
  }
  if (current === 'assistant' && !showAssistantPane) {
    return 'chat';
  }
  return current;
};
