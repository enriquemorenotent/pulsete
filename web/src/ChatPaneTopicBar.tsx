import { memo, useId, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { FormattedMessageText } from './FormattedMessageText.js';

type ChatPaneTopicBarProps = {
  topic: string;
  onOpenChannel: (channel: string) => void;
};

const compactTopicPreviewLength = 72;
const desktopTopicPreviewLength = 150;

export const ChatPaneTopicBar = memo(function ChatPaneTopicBar(props: ChatPaneTopicBarProps) {
  const topic = props.topic.trim();
  const topicId = useId();
  const [expandedTopic, setExpandedTopic] = useState<{ expanded: boolean; topic: string }>({
    expanded: false,
    topic: '',
  });
  const expandable = topic.length > compactTopicPreviewLength;
  const expanded = expandable && expandedTopic.expanded && expandedTopic.topic === topic;

  if (!topic) {
    return null;
  }

  return (
    <div className="border-t border-white/6 bg-background/80 px-4 py-2.5">
      <div className="flex items-start gap-2.5 border-l-2 border-primary/55 pl-3">
        <div
          id={topicId}
          className="min-w-0 flex-1 break-words text-[13px] leading-6 text-foreground/88"
        >
          {expanded || !expandable ? (
            <FormattedMessageText
              text={topic}
              onOpenChannel={props.onOpenChannel}
              renderInlinePreviews={false}
            />
          ) : (
            <>
              <span className="sm:hidden">
                <FormattedMessageText
                  text={getTopicPreview(topic, compactTopicPreviewLength)}
                  onOpenChannel={props.onOpenChannel}
                  renderInlinePreviews={false}
                />
              </span>
              <span className="hidden sm:inline">
                <FormattedMessageText
                  text={getTopicPreview(topic, desktopTopicPreviewLength)}
                  onOpenChannel={props.onOpenChannel}
                  renderInlinePreviews={false}
                />
              </span>
            </>
          )}
        </div>
        {expandable ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mt-0.5 size-7 shrink-0 rounded-md"
            aria-controls={topicId}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse channel description' : 'Show full channel description'}
            title={expanded ? 'Collapse channel description' : 'Show full channel description'}
            onClick={() => setExpandedTopic({ expanded: !expanded, topic })}
          >
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </Button>
        ) : null}
      </div>
    </div>
  );
});

function getTopicPreview(topic: string, limit: number) {
  if (topic.length <= limit) {
    return topic;
  }

  const clipped = topic.slice(0, limit).trimEnd();
  const lastSpaceIndex = clipped.lastIndexOf(' ');
  const readableClip = lastSpaceIndex >= Math.floor(limit * 0.65)
    ? clipped.slice(0, lastSpaceIndex)
    : clipped;
  return `${readableClip}...`;
}
