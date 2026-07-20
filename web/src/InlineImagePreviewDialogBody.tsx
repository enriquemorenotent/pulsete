import { buildImageAltText } from './formatted-message-inline-images.js';
import { InlineMediaPreviewDialogBody } from './InlineMediaPreviewDialogBody.js';

export function InlineImagePreviewDialogBody(props: { altText?: string; href: string }) {
  return (
    <InlineMediaPreviewDialogBody
      label={props.altText ?? buildImageAltText(props.href)}
      media={{
        kind: 'image',
        originalHref: props.href,
        sourceHref: props.href,
      }}
    />
  );
}
