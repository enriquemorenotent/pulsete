import type { AppModel } from './app-model.js';
import type { State } from './app-types.js';

export type AppSessionSnapshot = {
  draft: string;
  model: AppModel;
  state: State;
};

export const createAppSessionSnapshot = (snapshot: AppSessionSnapshot): AppSessionSnapshot => snapshot;
