import { useEffect, useState } from 'react';
import { CircleCheck, CirclePause, LoaderCircle } from 'lucide-react';
import type { AssistantIndexProgress } from '../../shared/protocol-ai.js';
import { requestJson } from './api-request.js';

const idle: AssistantIndexProgress = { stage: 'idle' };
const labels = {
  preparing: 'Preparing chat history…',
  downloading: 'Downloading search model',
  indexing: 'Indexing chat history',
  updating: 'Updating chat index…',
  ready: 'History search ready',
  paused: 'History indexing paused',
};

function sameProgress(left: AssistantIndexProgress, right: AssistantIndexProgress) {
  if (left.stage !== right.stage) return false;
  if (left.stage === 'downloading' && right.stage === 'downloading')
    return Math.floor(100 * left.receivedBytes / left.totalBytes) === Math.floor(100 * right.receivedBytes / right.totalBytes);
  if (left.stage === 'indexing' && right.stage === 'indexing')
    return left.completed === right.completed && left.total === right.total;
  return true;
}

export function AssistantIndexIndicator() {
  const [progress, setProgress] = useState<AssistantIndexProgress>(idle);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      let next = idle;
      try {
        next = await requestJson<AssistantIndexProgress>('/api/assistant/index-progress', {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(3_000)]),
        });
      } catch {
        // A disconnected backend has no current progress to display.
      }
      if (controller.signal.aborted) return;
      setProgress(previous => sameProgress(previous, next) ? previous : next);
      timer = setTimeout(refresh, next.stage === 'idle' || next.stage === 'paused' ? 1_000 : 400);
    };
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  const { stage } = progress;
  const label = stage === 'idle' ? '' : labels[stage];
  const value = progress.stage === 'downloading' ? Math.floor(100 * progress.receivedBytes / progress.totalBytes)
    : progress.stage === 'indexing' ? progress.completed : null;
  const max = progress.stage === 'indexing' ? progress.total : 100;
  const detail = progress.stage === 'downloading' ? `${value}%`
    : progress.stage === 'indexing' ? `${value} of ${max} sections` : null;
  const Icon = stage === 'ready' ? CircleCheck : stage === 'paused' ? CirclePause : LoaderCircle;

  return (
    <>
      <span role="status" className="sr-only">{label}</span>
      {stage === 'idle' ? null : (
        <div className="mr-2 flex shrink-0 flex-col gap-1 px-1 text-xs text-muted-foreground">
          {value === null ? (
            <span className="flex items-center gap-1.5" aria-hidden="true">
              <Icon className={stage === 'preparing' || stage === 'updating' ? 'size-3.5 motion-safe:animate-spin' : 'size-3.5'} />
              {label}
            </span>
          ) : (
            <>
              <span aria-hidden="true" className="whitespace-nowrap">{label} · <span className="tabular-nums">{detail}</span></span>
              <progress value={value} max={max} aria-label={label} aria-valuetext={detail ?? undefined}
                className="h-0.5 w-full appearance-none overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary" />
            </>
          )}
        </div>
      )}
    </>
  );
}
