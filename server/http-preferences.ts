import { z } from 'zod';
import { badRequest } from './app-error.js';
import { readJson, writeJson } from './http-utils.js';
import type { RouteArgs } from './http-types.js';
import { workspacePreferencesPatchSchema } from '../shared/protocol-preferences.js';
import { parseAvatarOverrideInput } from './http-avatar-overrides.js';

const legacyImportSchema = z.object({
  preferences: workspacePreferencesPatchSchema.default({}),
  avatarOverrides: z.array(z.unknown()).max(1_000).default([]),
}).strict();

export const legacyImportBodyLimitBytes = 32 * 1024 * 1024;

export const handlePreferenceRoutes = async ({ req, res, pathname, context }: RouteArgs) => {
  if (pathname === '/api/preferences' && req.method === 'PATCH') {
    const result = workspacePreferencesPatchSchema.safeParse(await readJson(req));
    if (!result.success) {
      throw badRequest('Invalid preference payload');
    }
    writeJson(res, 200, context.preferences.update(result.data));
    return true;
  }
  if (pathname === '/api/preferences/import-legacy' && req.method === 'POST') {
    const result = legacyImportSchema.safeParse(await readJson(req, legacyImportBodyLimitBytes));
    if (!result.success) {
      throw badRequest('Invalid legacy preference payload');
    }
    const avatars = result.data.avatarOverrides.flatMap((avatar) => {
      try {
        return [parseAvatarOverrideInput(avatar)];
      } catch {
        return [];
      }
    });
    const skippedAvatarOverrides = result.data.avatarOverrides.length - avatars.length;
    writeJson(res, 200, context.preferences.importLegacy(
      result.data.preferences,
      avatars,
      skippedAvatarOverrides,
    ));
    return true;
  }
  return false;
};
