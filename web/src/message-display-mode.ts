export const messageDisplayModes = ['colors', 'stripped', 'raw'] as const;

export type MessageDisplayMode = (typeof messageDisplayModes)[number];

export const messageDisplayModeLabels: Record<MessageDisplayMode, string> = {
  colors: 'Colors',
  stripped: 'Stripped',
  raw: 'Raw',
};
