import { z } from 'zod';

// A new runtime gets a new epoch; revisions are ordered only within that epoch.
export const stateRevisionSchema = z.object({
  epoch: z.string().min(1),
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
export type StateRevision = z.infer<typeof stateRevisionSchema>;
