import { Fragment, memo, useMemo } from 'react';
import {
  canonicalizeAssistantText,
  parseAssistantDocument,
  type AssistantDocumentBlock,
  type AssistantDocumentSection,
} from '../../shared/assistant-document.js';
import { getEvidenceSpeakerLabel } from '../../shared/message-speaker.js';
import type { AssistantAskEvidenceGroup, AssistantAskEvidenceLine } from '../../shared/protocol.js';
import { Badge } from '@/components/ui/badge.js';
import { FormattedMessageText } from './FormattedMessageText.js';

type AssistantMessageContentProps = {
  evidenceGroups?: AssistantAskEvidenceGroup[];
  normalizeText?: boolean;
  text: string;
  onOpenChannel: (channel: string) => void;
};

type RenderSection =
  | { type: 'document'; section: AssistantDocumentSection }
  | { type: 'deterministic-evidence'; groups: AssistantAskEvidenceGroup[] };

export const AssistantMessageContent = memo(function AssistantMessageContent(
  props: AssistantMessageContentProps,
) {
  const text = useMemo(
    () => props.normalizeText ? canonicalizeAssistantText(props.text) : props.text,
    [props.normalizeText, props.text],
  );
  const document = useMemo(() => parseAssistantDocument(text), [text]);
  const sections = useMemo(
    () => buildRenderSections(document.sections, props.evidenceGroups ?? []),
    [document.sections, props.evidenceGroups],
  );

  return (
    <div className="space-y-4">
      {sections.map((section, sectionIndex) => section.type === 'document'
        ? (
            <section
              key={`section-${sectionIndex}`}
              className={section.section.label === 'Evidence'
                ? 'space-y-2 rounded-md border border-border/80 bg-background/60 px-3 py-2.5'
                : 'space-y-2'}
            >
              {section.section.blocks.map((block, blockIndex) => (
                <AssistantDocumentBlockView
                  key={`block-${sectionIndex}-${blockIndex}`}
                  block={block}
                  onOpenChannel={props.onOpenChannel}
                />
              ))}
            </section>
          )
        : (
            <AssistantDeterministicEvidenceSection
              key={`section-${sectionIndex}`}
              groups={section.groups}
              onOpenChannel={props.onOpenChannel}
            />
          ))}
    </div>
  );
});

const buildRenderSections = (
  sections: AssistantDocumentSection[],
  evidenceGroups: AssistantAskEvidenceGroup[],
): RenderSection[] => {
  if (evidenceGroups.length === 0) {
    return sections.map((section) => ({ type: 'document' as const, section }));
  }

  const filteredSections = sections.filter((section) => section.label !== 'Evidence');
  const renderSections: RenderSection[] = filteredSections.map((section) => ({
    type: 'document' as const,
    section,
  }));
  const firstEvidenceIndex = sections.findIndex((section) => section.label === 'Evidence');
  const insertionIndex = firstEvidenceIndex >= 0
    ? sections.slice(0, firstEvidenceIndex).filter((section) => section.label !== 'Evidence').length
    : filteredSections.findIndex((section) => section.label === 'Limits');

  const evidenceSection: RenderSection = {
    type: 'deterministic-evidence',
    groups: evidenceGroups,
  };

  if (insertionIndex >= 0) {
    renderSections.splice(insertionIndex, 0, evidenceSection);
    return renderSections;
  }

  return [...renderSections, evidenceSection];
};

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

const AssistantDeterministicEvidenceSection = (props: {
  groups: AssistantAskEvidenceGroup[];
  onOpenChannel: (channel: string) => void;
}) => (
  <section className="space-y-3 rounded-md border border-border/80 bg-background/60 px-3 py-2.5">
    <div className="space-y-3">
      {props.groups.map((group, groupIndex) => (
        <div key={`evidence-group-${groupIndex}`} className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{group.heading}</p>
          <div className="space-y-1 pl-3 text-[13px] leading-6 text-foreground">
            {group.lines.map((line) => (
              <AssistantEvidenceLineView
                key={line.messageId}
                line={line}
                onOpenChannel={props.onOpenChannel}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  </section>
);

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

const AssistantEvidenceLineView = (props: {
  line: AssistantAskEvidenceLine;
  onOpenChannel: (channel: string) => void;
}) => {
  if (props.line.kind === 'join' || props.line.kind === 'part' || props.line.kind === 'quit' || props.line.kind === 'system') {
    return (
      <div className="break-words">
        <FormattedMessageText
          text={`[${props.line.kind}] ${props.line.body}`}
          onOpenChannel={props.onOpenChannel}
        />
      </div>
    );
  }

  const speaker = getEvidenceSpeakerLabel(props.line);
  const prefix = props.line.kind === 'action'
    ? `* ${speaker} `
    : `${speaker}: `;

  return (
    <div className="break-words">
      <span className="font-medium text-foreground">{prefix}</span>
      <FormattedMessageText text={props.line.body} onOpenChannel={props.onOpenChannel} />
    </div>
  );
};
