export type BannerOptions = {
  id?: string;
  // null keeps the notification visible until it is dismissed or resolved.
  dismissAfterMs?: number | null;
};

export type BannerInput = { kind: 'notice' | 'error'; message: string } & BannerOptions;
export type Banner = (BannerInput & { dismissAfterMs: number | null }) | null;
export type UpdateBanner = (kind: 'notice' | 'error', message: string, options?: BannerOptions) => void;

export const createBanner = (
  kind: 'notice' | 'error', message: string, options: BannerOptions = {},
): NonNullable<Banner> => ({
  ...options,
  kind,
  message,
  dismissAfterMs: options.dismissAfterMs === undefined ? 4_200 : options.dismissAfterMs,
});
