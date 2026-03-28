import type {
  AssistantSnapshot,
  AssistantThread,
  AssistantTurnAttachmentInput,
} from '../../shared/protocol.js';

export type AssistantPanelProps = {
  activeBufferLabel: string | null;
  assistant: AssistantSnapshot;
  contextSubtitle: string;
  contextKey: string;
  contextTitle: string;
  loading: boolean;
  busy: boolean;
  resolvedSubjectLabel: string | null;
  subjectPending: boolean;
  thread: AssistantThread | null;
  onNewChat: () => Promise<boolean>;
  onOpenChannel: (channel: string) => void;
  onStop: () => Promise<boolean>;
  onSubmitPrompt: (prompt: string, attachments: AssistantTurnAttachmentInput[]) => Promise<boolean>;
};
