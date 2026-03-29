export const assistantSectionLabels = ['Answer', 'Evidence', 'Limits'] as const;

export type AssistantSectionLabel = (typeof assistantSectionLabels)[number];

export type AssistantDocument = {
  sections: AssistantDocumentSection[];
};

export type AssistantDocumentSection = {
  label: AssistantSectionLabel | null;
  blocks: AssistantDocumentBlock[];
};

export type AssistantDocumentBlock =
  | {
      type: 'paragraph';
      lines: string[];
    }
  | {
      type: 'bullet-list';
      items: { lines: string[] }[];
    }
  | {
      type: 'code-fence';
      language: string | null;
      text: string;
    };
