import { z } from 'zod';

export const pagePreviewUrlMaxLength = 2_048;

export const pagePreviewRequestSchema = z.object({
  networkId: z.string().min(1).optional(),
  url: z.string().trim().min(1).max(pagePreviewUrlMaxLength),
});

export type PagePreviewRequest = z.infer<typeof pagePreviewRequestSchema>;

export type PagePreview = {
  imageUrl: string;
  pageUrl: string;
  title: string | null;
};

export type PagePreviewUnavailableReason = 'not-found';

export type PagePreviewResponse =
  | {
      preview: PagePreview;
      unavailableReason: null;
    }
  | {
      preview: null;
      unavailableReason: PagePreviewUnavailableReason | null;
    };
