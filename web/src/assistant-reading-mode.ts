import { createContext, useContext } from 'react';

export const AssistantReadingModeContext = createContext<{
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
} | null>(null);

export const useAssistantReadingMode = () => useContext(AssistantReadingModeContext);
