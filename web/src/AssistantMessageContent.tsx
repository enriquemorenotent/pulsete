import { memo, useMemo } from 'react';
import { Badge } from '@/components/ui/badge.js';
import { FormattedMessageText } from './FormattedMessageText.js';

type AssistantMessageContentProps = {
  text: string;
  onOpenChannel: (channel: string) => void;
};

type AssistantMessageBlock =
  | { type: 'text'; text: string }
  | { type: 'code'; language: string | null; text: string };

const fencePattern = /```([^\n`]*)\n?([\s\S]*?)```/g;

export const parseAssistantMessageBlocks = (text: string): AssistantMessageBlock[] => {
  const blocks: AssistantMessageBlock[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(fencePattern)) {
    const start = match.index ?? 0;
    pushTextBlock(blocks, text.slice(lastIndex, start));
    blocks.push({
      type: 'code',
      language: normalizeFenceLanguage(match[1] ?? ''),
      text: trimFencePadding(match[2] ?? ''),
    });
    lastIndex = start + match[0].length;
  }

  pushTextBlock(blocks, text.slice(lastIndex));
  return blocks;
};

export const AssistantMessageContent = memo(function AssistantMessageContent(
  props: AssistantMessageContentProps,
) {
  const blocks = useMemo(() => parseAssistantMessageBlocks(props.text), [props.text]);

  return (
    <div className="space-y-3">
      {blocks.map((block, index) =>
        block.type === 'code' ? (
          <div key={`code-${index}`} className="overflow-hidden rounded-md border border-border/80 bg-background/80">
            {block.language ? (
              <div className="border-b border-border/80 px-3 py-2">
                <Badge variant="secondary">{block.language}</Badge>
              </div>
            ) : null}
            <pre className="max-w-full overflow-x-auto px-3 py-3 text-[12px] leading-5 text-foreground">
              <code>{block.text}</code>
            </pre>
          </div>
        ) : (
          <div key={`text-${index}`} className="whitespace-pre-wrap break-words leading-6">
            <FormattedMessageText text={block.text} onOpenChannel={props.onOpenChannel} />
          </div>
        ),
      )}
    </div>
  );
});

const pushTextBlock = (blocks: AssistantMessageBlock[], text: string) => {
  if (!text.trim()) {
    return;
  }
  blocks.push({
    type: 'text',
    text,
  });
};

const normalizeFenceLanguage = (value: string) => {
  const text = value.trim();
  return text.length > 0 ? text : null;
};

const trimFencePadding = (value: string) => value.replace(/^\n+/, '').replace(/\n+$/, '');
