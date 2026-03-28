import type { AssistantSnapshot } from '../../shared/protocol.js';

export type AssistantPanelStatusState = {
  detail: string | null;
  label: string;
  tone: 'danger' | 'neutral';
};

export type AssistantPanelMetaSegment = {
  label: 'Subject';
  tone?: 'warning';
  value: string;
};

export const resolveAssistantPanelStatusState = (params: {
  assistantReady: boolean;
  authLastError: string | null;
  serviceError: string | null;
  serviceStatus: AssistantSnapshot['serviceStatus'];
}): AssistantPanelStatusState | null => {
  if (params.authLastError) {
    return { label: 'Sign-in issue', detail: params.authLastError, tone: 'danger' };
  }
  if (params.serviceStatus === 'error' && params.serviceError) {
    return { label: 'Service error', detail: params.serviceError, tone: 'danger' };
  }
  if (!params.assistantReady) {
    return {
      label: 'Unavailable',
      detail: 'Sign in from Preferences.',
      tone: 'neutral',
    };
  }
  return null;
};

export const resolveAssistantPanelMetaSegments = (params: {
  activeBufferLabel: string | null;
  resolvedSubjectLabel: string | null;
  subjectPending: boolean;
}): AssistantPanelMetaSegment[] => {
  if (params.subjectPending) {
    return [{ label: 'Subject', value: 'awaiting confirmation', tone: 'warning' }];
  }
  if (params.resolvedSubjectLabel && params.resolvedSubjectLabel !== params.activeBufferLabel) {
    return [{ label: 'Subject', value: params.resolvedSubjectLabel }];
  }
  return [];
};

export type AssistantPromptKeyEvent = {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  nativeEvent: {
    isComposing?: boolean;
  };
};

export const shouldSubmitAssistantPrompt = (event: AssistantPromptKeyEvent) =>
  event.key === 'Enter'
  && !event.shiftKey
  && !event.altKey
  && !event.ctrlKey
  && !event.metaKey
  && !event.nativeEvent.isComposing;
