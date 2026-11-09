import { AutosaveQueue } from './autosave-queue.js';

// Keep writes ordered even when an editor unmounts and is opened again.
// Each edit supplies its writer, bound to that specific conversation or network.
export const notesAutosave = new AutosaveQueue(null, {
  delayMs: 600,
  retryDelayMs: null,
});
