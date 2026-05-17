import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampPan,
  resolveCropSourceRect,
} from '../web/src/network-server-image-crop-utils.js';

test('square crop source rect keeps the center at default zoom', () => {
  assert.deepEqual(
    resolveCropSourceRect({ width: 800, height: 400 }, { x: 0, y: 0 }, 1, 200),
    { x: 200, y: 0, width: 400, height: 400 },
  );
});

test('crop source rect respects zoom and pan', () => {
  const rect = resolveCropSourceRect(
    { width: 800, height: 400 },
    { x: -50, y: 0 },
    2,
    200,
  );

  assert.equal(rect.x, 350);
  assert.equal(rect.y, 100);
  assert.equal(rect.width, 200);
  assert.equal(rect.height, 200);
});

test('crop pan clamps to the rendered image edges', () => {
  assert.deepEqual(
    clampPan({ x: 999, y: -999 }, { width: 800, height: 400 }, 1, 200),
    { x: 100, y: 0 },
  );
});
