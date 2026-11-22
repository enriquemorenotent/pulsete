import { useCallback, useEffect, useState } from 'react';
import type { BufferState } from '../../shared/protocol-chat.js';
import { api } from './client.js';
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from './components/ui/dialog.js';
import { parseFormattedMessageContent } from './formatted-message-content.js';
import { resolvePagePreviewResult } from './page-preview-media.js';
import { useMediaAccount } from './account-media.js';
import type { InlineMedia } from './formatted-message-inline-media.js';
import { FormattedMessageInlinePreviews } from './FormattedMessageInlinePreviews.js';

export function QueryMediaGallery({ buffer }: { buffer: BufferState }) {
  const { cacheKey } = useMediaAccount();
  return (
    <Dialog>
      <DialogTrigger asChild><button className="rounded px-2 py-1 text-sm hover:bg-accent">Media</button></DialogTrigger>
      <DialogContent className="w-[48rem] max-w-[90vw]" aria-describedby={undefined}>
        <div className="flex items-center justify-between"><DialogTitle>Media shared with {buffer.target}</DialogTitle><DialogClose className="rounded px-2 py-1 text-sm hover:bg-accent">Close</DialogClose></div>
        <GalleryHistory key={JSON.stringify([buffer.id, cacheKey])} buffer={buffer} cacheKey={cacheKey} />
      </DialogContent>
    </Dialog>
  );
}

type GalleryEntry = { href: string; media?: InlineMedia | null };

function PagePreviewLoader({ href, networkId, cacheKey, onResult }: {
  href: string;
  networkId: string;
  cacheKey: string;
  onResult: (href: string, media: InlineMedia | null) => void;
}) {
  useEffect(() => {
    let active = true;
    void resolvePagePreviewResult(href, networkId, cacheKey).then(result => {
      if (active) onResult(href, result.media);
    });
    return () => { active = false; };
  }, [href, networkId, cacheKey, onResult]);
  return null;
}

function GalleryHistory({ buffer, cacheKey }: { buffer: BufferState; cacheKey: string }) {
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const media = entries.flatMap(entry => entry.media ?? []);
  const pending = entries.filter(entry => entry.media === undefined).slice(0, 4);
  const onResult = useCallback((href: string, result: InlineMedia | null) => {
    setEntries(previous => previous.map(entry => entry.href === href ? { href, media: result } : entry));
  }, []);
  const [cursor, setCursor] = useState<string>();
  const [status, setStatus] = useState<'loading' | 'more' | 'done' | 'error'>('loading');

  useEffect(() => {
    if (status !== 'loading') return;
    const controller = new AbortController();
    const { signal } = controller;

    async function loadPage() {
      const page = await api.loadHistory(buffer.id, undefined, cursor, { signal });
      if (signal.aborted) return;
      const items = page.messages.slice().reverse().flatMap(message => {
        const { inlineMedia, pagePreviewHrefs } = parseFormattedMessageContent(message.body, undefined);
        return [
          ...inlineMedia.map(media => ({ href: media.originalHref, media })),
          ...pagePreviewHrefs.map(href => ({ href })),
        ];
      });
      setEntries(previous => {
        const seen = new Set(previous.map(entry => entry.href));
        return previous.concat(items.filter(entry => {
          if (seen.has(entry.href)) return false;
          seen.add(entry.href);
          return true;
        }));
      });
      const oldest = page.messages[0]?.id;
      setStatus(page.hasMore && oldest && oldest !== cursor ? 'more' : 'done');
      setCursor(oldest);
    }

    void loadPage().catch(() => {
      if (!signal.aborted) setStatus('error');
    });
    return () => controller.abort();
  }, [buffer.id, cursor, status]);

  return (
    <div className="max-h-[70vh] overflow-y-auto">
      {pending.map(({ href }) => <PagePreviewLoader key={href} href={href} networkId={buffer.networkId} cacheKey={cacheKey} onResult={onResult} />)}
      <FormattedMessageInlinePreviews media={media} />
      {status === 'done' && !pending.length && !media.length && <p>No media shared yet.</p>}
      {(status === 'loading' || pending.length > 0) && <p role="status">Loading media…</p>}
      {(status === 'more' || status === 'error') && (
        <button className="rounded px-2 py-1 text-sm hover:bg-accent" onClick={() => setStatus('loading')}>
          {status === 'error' ? 'Couldn’t load media. Retry' : 'Load older messages'}
        </button>
      )}
    </div>
  );
}
