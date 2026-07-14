import assert from 'node:assert/strict';
import test from 'node:test';
import { BoundedRecencySet } from '../web/src/bounded-recency-set.js';

test('bounded recency set evicts its least recently added value', () => {
  const values = new BoundedRecencySet<string>(2);
  values.add('first').add('second');

  assert.equal(values.has('first'), true);
  values.add('third');

  assert.equal(values.size, 2);
  assert.equal(values.has('first'), false);
  assert.equal(values.has('second'), true);
  assert.equal(values.has('third'), true);
});

test('adding an existing value refreshes its recency', () => {
  const values = new BoundedRecencySet<string>(2);
  values.add('first').add('second').add('first').add('third');

  assert.equal(values.has('first'), true);
  assert.equal(values.has('second'), false);
  assert.equal(values.has('third'), true);
});

test('bounded recency set rejects invalid capacities', () => {
  assert.throws(() => new BoundedRecencySet(0), RangeError);
  assert.throws(() => new BoundedRecencySet(1.5), RangeError);
});
