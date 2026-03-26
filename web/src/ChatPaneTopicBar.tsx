import { memo } from 'react';
import { FormattedMessageText } from './FormattedMessageText.js';

type ChatPaneTopicBarProps = {
  topic: string;
  onOpenChannel: (channel: string) => void;
};

export const ChatPaneTopicBar = memo(function ChatPaneTopicBar(props: ChatPaneTopicBarProps) {
  const topic = props.topic.trim();
  if (!topic) {
    return null;
  }

  return (
    <div className="border-t border-white/6 bg-black/10 px-4 py-2.5">
      <div className="flex items-start gap-3">
        <span className="shrink-0 pt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Topic
        </span>
        <div className="min-w-0 flex-1 break-words text-[13px] leading-6 text-foreground/88">
          <FormattedMessageText
            text={topic}
            onOpenChannel={props.onOpenChannel}
            renderInlinePreviews={false}
          />
        </div>
      </div>
    </div>
  );
});
