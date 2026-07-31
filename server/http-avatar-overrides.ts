import { z } from 'zod';
import { badRequest, payloadTooLarge } from './app-error.js';
import { decodeRouteParam, readJson, writeJson } from './http-utils.js';
import type { RouteArgs } from './http-types.js';
import { networkUserIdentitySchema } from '../shared/user-identity.js';
import type { AvatarOverrideInput } from './storage-avatar-overrides-repository.js';

export const maxAvatarImageBytes = 4 * 1024 * 1024;
export const avatarJsonBodyLimitBytes = 8 * 1024 * 1024;
const allowedImageMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

const avatarTargetSchema = z.object({
  networkId: z.string().min(1),
  nick: z.string().trim().min(1),
  identity: networkUserIdentitySchema.nullable().optional(),
});

const avatarInputSchema = z.union([
  avatarTargetSchema.extend({ dataUrl: z.string().min(1), externalUrl: z.undefined().optional() }),
  avatarTargetSchema.extend({ externalUrl: z.string().url(), dataUrl: z.undefined().optional() }),
]);

export const handleAvatarOverrideRoutes = async ({ req, res, pathname, context }: RouteArgs) => {
  if (pathname === '/api/user-avatar-overrides' && req.method === 'PUT') {
    const input = parseAvatarOverrideInput(await readJson(req, avatarJsonBodyLimitBytes));
    writeJson(res, 200, context.avatarOverrides.upsert(input));
    return true;
  }

  const imageMatch = pathname.match(/^\/api\/user-avatar-overrides\/([^/]+)\/image$/);
  if (imageMatch && req.method === 'GET') {
    const source = context.avatarOverrides.source(decodeRouteParam(imageMatch[1]));
    if (!source) {
      res.statusCode = 404;
      res.end('Not found');
      return true;
    }
    const etag = `"${source.updatedAt}-${source.data.byteLength}"`;
    if (req.headers['if-none-match'] === etag) {
      res.statusCode = 304;
      res.end();
      return true;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', source.mimeType);
    res.setHeader('Content-Length', String(source.data.byteLength));
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.setHeader('ETag', etag);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(source.data);
    return true;
  }

  const overrideMatch = pathname.match(/^\/api\/user-avatar-overrides\/([^/]+)$/);
  if (overrideMatch && req.method === 'DELETE') {
    writeJson(res, 200, context.avatarOverrides.remove(decodeRouteParam(overrideMatch[1])));
    return true;
  }
  return false;
};

export const parseAvatarOverrideInput = (value: unknown): AvatarOverrideInput => {
  const result = avatarInputSchema.safeParse(value);
  if (!result.success) {
    throw badRequest('Invalid avatar override payload');
  }
  const target = {
    networkId: result.data.networkId,
    nick: result.data.nick,
    identity: result.data.identity,
  };
  if (result.data.dataUrl) {
    const image = decodeImageDataUrl(result.data.dataUrl);
    return { ...target, sourceKind: 'blob', ...image };
  }
  if (!result.data.externalUrl) {
    throw badRequest('Avatar source is required');
  }
  const url = new URL(result.data.externalUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw badRequest('Avatar URL must use HTTP or HTTPS');
  }
  return { ...target, sourceKind: 'external', externalUrl: url.toString() };
};

const decodeImageDataUrl = (value: string) => {
  const match = value.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match || !allowedImageMimeTypes.has(match[1].toLowerCase())) {
    throw badRequest('Avatar must be a PNG, JPEG, WebP, or GIF image');
  }
  const data = Buffer.from(match[2], 'base64');
  if (data.byteLength === 0) {
    throw badRequest('Avatar image is empty');
  }
  if (data.byteLength > maxAvatarImageBytes) {
    throw payloadTooLarge('Avatar image is larger than 4 MB');
  }
  const mimeType = match[1].toLowerCase();
  if (!hasExpectedImageSignature(data, mimeType)) {
    throw badRequest('Avatar content does not match its image type');
  }
  return { data, mimeType };
};

const hasExpectedImageSignature = (data: Buffer, mimeType: string) => {
  if (mimeType === 'image/png') {
    return data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === 'image/jpeg') {
    return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  }
  if (mimeType === 'image/gif') {
    const signature = data.subarray(0, 6).toString('ascii');
    return signature === 'GIF87a' || signature === 'GIF89a';
  }
  return mimeType === 'image/webp'
    && data.subarray(0, 4).toString('ascii') === 'RIFF'
    && data.subarray(8, 12).toString('ascii') === 'WEBP';
};
