export type CompactWorkspacePane = 'browse' | 'chat' | 'details';

type ResolveCompactWorkspacePaneParams = {
  current: CompactWorkspacePane;
  selectedBufferId: string | null;
  previousSelectedBufferId: string | null;
  showDetailsPane: boolean;
};

export const getDefaultCompactWorkspacePane = (
  selectedBufferId: string | null,
): CompactWorkspacePane => (selectedBufferId ? 'chat' : 'browse');

export const resolveCompactWorkspacePane = ({
  current,
  selectedBufferId,
  previousSelectedBufferId,
  showDetailsPane,
}: ResolveCompactWorkspacePaneParams): CompactWorkspacePane => {
  if (!selectedBufferId) {
    return 'browse';
  }
  if (current === 'browse' && previousSelectedBufferId !== selectedBufferId) {
    return 'chat';
  }
  if (current === 'details' && !showDetailsPane) {
    return 'chat';
  }
  return current;
};
