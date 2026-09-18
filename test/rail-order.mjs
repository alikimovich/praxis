import assert from 'node:assert/strict'
import { moveId, orderedIds, railGroup } from '../src/renderer/src/lib/rail-order.ts'

const ids = ['a', 'b', 'c']
assert.deepEqual(orderedIds(ids, undefined), ids)
assert.deepEqual(orderedIds(ids, ['c', 'c', 'missing', 'a']), ['c', 'a', 'b'])
assert.deepEqual(orderedIds(ids, ['c', 'a'], true), ['b', 'c', 'a'])
assert.deepEqual(orderedIds(ids, 'malformed'), ids)
assert.deepEqual(moveId(ids, 'c', 'a', false), ['c', 'a', 'b'])
assert.deepEqual(moveId(ids, 'a', 'c', true), ['b', 'c', 'a'])
assert.deepEqual(moveId(ids, 'a', 'b', false), ids)
assert.equal(moveId(ids, 'stale', 'b', true), ids)
assert.equal(moveId(ids, 'a', 'stale', true), ids)
assert.deepEqual(ids, ['a', 'b', 'c'])
assert.notEqual(railGroup('live', 'a'), railGroup('history', 'a'))
assert.notEqual(railGroup('live', 'a'), railGroup('live', 'b'))
console.log(
  'RAIL-ORDER OK — stable manual rank, new/stale items, malformed data, no-op moves and group scoping'
)
