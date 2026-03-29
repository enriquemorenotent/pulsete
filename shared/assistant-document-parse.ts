import {
  assistantSectionLabels,
  type AssistantDocument,
  type AssistantDocumentBlock,
  type AssistantDocumentSection,
  type AssistantSectionLabel,
} from './assistant-document-types.js';
import {
  splitRawTextBlocks,
  trimFencePadding,
} from './assistant-document-fences.js';

export const parseAssistantDocument = (text: string): AssistantDocument => {
  const sections: AssistantDocumentSection[] = [];
  let currentSection = createSection(null);

  const pushCurrentSection = () => {
    if (currentSection.blocks.length === 0 && currentSection.label === null) {
      return;
    }
    sections.push(currentSection);
  };

  for (const block of splitRawTextBlocks(text)) {
    if (block.type === 'code-fence') {
      currentSection.blocks.push({
        type: 'code-fence',
        language: block.language,
        text: trimFencePadding(block.text),
      });
      continue;
    }

    const parser = createTextSectionParser({
      onSectionLabel: (label) => {
        pushCurrentSection();
        currentSection = createSection(label);
      },
      onBlock: (nextBlock) => {
        currentSection.blocks.push(nextBlock);
      },
    });
    parser.write(block.text);
    parser.finish();
  }

  pushCurrentSection();
  return { sections };
};

const createSection = (
  label: AssistantSectionLabel | null,
): AssistantDocumentSection => ({
  label,
  blocks: [],
});

const createTextSectionParser = (params: {
  onSectionLabel: (label: AssistantSectionLabel) => void;
  onBlock: (block: AssistantDocumentBlock) => void;
}) => {
  let paragraphLines: string[] = [];
  let bulletItems: Array<{ lines: string[] }> = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }
    params.onBlock({ type: 'paragraph', lines: paragraphLines });
    paragraphLines = [];
  };

  const flushBulletList = () => {
    if (bulletItems.length === 0) {
      return;
    }
    params.onBlock({ type: 'bullet-list', items: bulletItems });
    bulletItems = [];
  };

  const flushAll = () => {
    flushParagraph();
    flushBulletList();
  };

  return {
    write(text: string) {
      for (const rawLine of text.split('\n')) {
        const line = rawLine.trimEnd();
        const label = parseSectionLabel(line);
        if (label) {
          flushAll();
          params.onSectionLabel(label);
          continue;
        }
        if (!line.trim()) {
          flushAll();
          continue;
        }
        if (line.startsWith('- ')) {
          flushParagraph();
          bulletItems.push({ lines: [line.slice(2)] });
          continue;
        }
        if (bulletItems.length > 0) {
          bulletItems[bulletItems.length - 1]!.lines.push(line.trim());
          continue;
        }
        paragraphLines.push(line);
      }
    },
    finish() {
      flushAll();
    },
  };
};

const parseSectionLabel = (line: string): AssistantSectionLabel | null => {
  const value = line.trim();
  const candidate = value.slice(0, -1) as AssistantSectionLabel;
  return assistantSectionLabels.includes(candidate) && value.endsWith(':')
    ? candidate
    : null;
};
