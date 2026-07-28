import { Link2Off } from 'lucide-react';
import type { PagePreviewUnavailableReason } from '../../shared/protocol-page-preview.js';
import { usePagePreviewUnavailableReason } from './page-preview-media.js';

export function PagePreviewUnavailableIndicator(props: { href: string }) {
  const reason = usePagePreviewUnavailableReason(props.href);
  return <PagePreviewUnavailableStatusIcon reason={reason} />;
}

export function PagePreviewUnavailableStatusIcon(props: {
  reason: PagePreviewUnavailableReason | null;
}) {
  if (props.reason !== 'not-found') {
    return null;
  }
  return (
    <span
      role="img"
      aria-label="Page not found"
      title="Page not found"
      className="ml-1 inline-flex align-[-0.125em] text-destructive/80"
    >
      <Link2Off aria-hidden="true" className="size-3.5" />
    </span>
  );
}
