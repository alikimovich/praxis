import assert from 'node:assert/strict'
import { controlTarget } from '../src/renderer/src/lib/control-target.ts'
const request = { root: '/repo', file: 'src/Object.tsx', tab: 'custom', requestId: 'test' }
const node = (path, source) => ({ path, source, componentSource: null })
const parent = node([0], 'src/Object.tsx:3')
const child = node([0, 0], 'src/Object.tsx:7')
assert.equal(controlTarget([parent, child], request), parent)
assert.equal(controlTarget([parent, child], { ...request, source: child.source }), child)
assert.equal(controlTarget([parent, child, node([1], parent.source)], request), null)
assert.equal(controlTarget([parent, node([1], parent.source)], { ...request, source: parent.source }), null)
assert.equal(controlTarget([node([0], 'src/Elsewhere.tsx:3')], request), null)
console.log('CONTROL-TARGET OK — exact, nested, missing and ambiguous targets')
