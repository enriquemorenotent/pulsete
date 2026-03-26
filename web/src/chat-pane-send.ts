type ForceScrollToBottomRef = {
  current: (() => void) | null;
};

type ChatPaneSendParams = {
  sendComposer: () => Promise<boolean>;
  forceScrollToBottomRef: ForceScrollToBottomRef;
};

export async function sendComposerAndFollowBottom(params: ChatPaneSendParams) {
  const submitted = await params.sendComposer();
  if (!submitted) {
    return;
  }
  params.forceScrollToBottomRef.current?.();
}
