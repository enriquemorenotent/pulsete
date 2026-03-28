export const transcriptChunkCharBudget = 18_000;
export const transcriptAttachmentCharBudget = 180_000;
export const defaultFocusedEdgeCount = 12;
export const defaultExplicitEdgeCount = 24;
export const maximumExplicitEdgeCount = 200;
export const focusedWindowRadius = 4;
export const maximumFocusedWindows = 12;
export const focusedAttachmentCharBudget = 48_000;

export type FocusSlice = {
  start: number;
  end: number;
  label: string;
  priority: number;
};

export type TranscriptChunk = {
  index: number;
  start: number;
  end: number;
  text: string;
  chars: number;
};
