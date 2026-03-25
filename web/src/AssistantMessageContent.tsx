import { Fragment, memo, useMemo } from 'react';
import {
  canonicalizeAssistantText,
  parseAssistantDocument,
  type AssistantDocumentBlock,
} from '../../shared/assistant-document.js';
import { Badge } from '@/components/ui/badge.js';
import { FormattedMessageText } from './FormattedMessageText.js';

type AssistantMessageContentProps = {
  normalizeText?: boolean;
  text: string;
  onOpenChannel: (channel: string) => void;
};

export const AssistantMessageContent = memo(function AssistantMessageContent(
  props: AssistantMessageContentProps,
) {
  const text = useMemo(
    () => props.normalizeText ? canonicalizeAssistantText(props.text) : props.text,
    [props.normalizeText, props.text],
  );
  const document = useMemo(() => parseAssistantDocument(text), [text]);

  return (
    <div className="space-y-4">
      {document.sections.map((section, sectionIndex) => (
        <section key={`section-${sectionIndex}`} className="space-y-2">
          {section.label ? (
            <p className="text-[13px] font-semibold text-foreground">{section.label}:</p>
          ) : null}
          {section.blocks.map((block, blockIndex) => (
            <AssistantDocumentBlockView
              key={`block-${sectionIndex}-${blockIndex}`}
              block={block}
              onOpenChannel={props.onOpenChannel}
            />
          ))}
        </section>
      ))}
    </div>
  );
});

const AssistantDocumentBlockView = (props: {
  block: AssistantDocumentBlock;
  onOpenChannel: (channel: string) => void;
}) => {
  if (props.block.type === 'code-fence') {
    return (
      <div className="overflow-hidden rounded-md border border-border/80 bg-background/80">
        {props.block.language ? (
          <div className="border-b border-border/80 px-3 py-2">
            <Badge variant="secondary">{props.block.language}</Badge>
          </div>
        ) : null}
        <pre className="max-w-full overflow-x-auto px-3 py-3 text-[12px] leading-5 text-foreground">
          <code>{props.block.text}</code>
        </pre>
      </div>
    );
  }

  if (props.block.type === 'bullet-list') {
    return (
      <div className="space-y-1.5">
        {props.block.items.map((item, itemIndex) => (
          <div key={`item-${itemIndex}`} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 leading-6">
            <span className="text-foreground">-</span>
            <div className="min-w-0 break-words">
              <AssistantTextLines lines={item.lines} onOpenChannel={props.onOpenChannel} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="break-words leading-6">
      <AssistantTextLines lines={props.block.lines} onOpenChannel={props.onOpenChannel} />
    </div>
  );
};

const AssistantTextLines = (props: {
  lines: string[];
  onOpenChannel: (channel: string) => void;
}) => (
  <>
    {props.lines.map((line, index) => (
      <Fragment key={`line-${index}`}>
        <FormattedMessageText text={line} onOpenChannel={props.onOpenChannel} />
        {index < props.lines.length - 1 ? <br /> : null}
      </Fragment>
    ))}
  </>
);
