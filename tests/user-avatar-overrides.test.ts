import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseUserAvatarOverrides,
  resolveUserAvatarOverrideKey,
  resolveUserAvatarOverrideUrl,
  resolveUserAvatarTarget,
  serializeUserAvatarOverrides,
} from '../web/src/user-avatars/override-model.js';

test('user avatar overrides parse and serialize valid custom images', () => {
  assert.deepEqual(parseUserAvatarOverrides(null), {});
  assert.deepEqual(parseUserAvatarOverrides('not-json'), {});
  assert.deepEqual(
    parseUserAvatarOverrides(JSON.stringify({
      ' key-b ': ' https://example.test/b.png ',
      'key-a': 'data:image/png;base64,a',
      'key-empty': '   ',
      'key-invalid': 7,
    })),
    {
      'key-a': 'data:image/png;base64,a',
      'key-b': 'https://example.test/b.png',
    },
  );
  assert.equal(
    serializeUserAvatarOverrides({
      ' key-b ': 'https://example.test/b.png',
      'key-a': 'data:image/png;base64,a',
      'key-empty': '',
    }),
    '{"key-a":"data:image/png;base64,a","key-b":"https://example.test/b.png"}',
  );
});

test('user avatar overrides require stable identity unless nick fallback is allowed', () => {
  const stableTarget = resolveUserAvatarTarget('network-1', {
    account: 'AliceAccount',
    nick: 'Alice',
  });
  const stableKey = resolveUserAvatarOverrideKey(stableTarget);

  assert.ok(stableKey);
  assert.equal(
    resolveUserAvatarOverrideUrl({
      target: stableTarget,
      userAvatarOverrides: { [stableKey]: 'data:image/png;base64,stable' },
    }),
    'data:image/png;base64,stable',
  );

  const nickTarget = resolveUserAvatarTarget('network-1', { nick: 'Alice' });
  const nickKey = resolveUserAvatarOverrideKey(nickTarget, { allowNickFallback: true });

  assert.equal(resolveUserAvatarOverrideKey(nickTarget), null);
  assert.ok(nickKey);
  assert.equal(
    resolveUserAvatarOverrideUrl({
      allowNickFallback: true,
      target: nickTarget,
      userAvatarOverrides: { [nickKey]: 'data:image/png;base64,nick' },
    }),
    'data:image/png;base64,nick',
  );
});

test('user avatar override lookup falls back to legacy query buffer avatars', () => {
  const target = resolveUserAvatarTarget('network-1', { nick: 'Alice' });

  assert.equal(
    resolveUserAvatarOverrideUrl({
      allowNickFallback: true,
      legacyBufferId: 'query-alice',
      queryAvatarOverrides: { 'query-alice': 'data:image/png;base64,legacy' },
      target,
    }),
    'data:image/png;base64,legacy',
  );
});
