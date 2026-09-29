// The platform owner's media grants, attachments and server recovery, against the real
// Swift owner (see test/platform-owner.mjs for the fixture and the simulator checks).
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { mediaTypeFor } from '../../src/main/media-types.ts'
import { attachmentFileName, pruneAttachments } from '../../src/main/attachments.ts'
import { findPreviewProcesses } from '../../src/native/preview-processes.ts'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')

export async function checkMedia({ fixture, scratch, log, rejects, sleep }) {
  log('media: scoped grants (view, containment, size, hash, identity, expiry, bound)')
  const root = join(scratch, 'media-project'), outside = join(scratch, 'outside.png')
  mkdirSync(join(root, '.git'), { recursive: true }); mkdirSync(join(root, 'node_modules'))
  const logo = randomBytes(4096)
  writeFileSync(join(root, 'logo.png'), logo)
  writeFileSync(join(root, 'clip.mp4'), randomBytes(2048))
  writeFileSync(join(root, 'a.gif'), randomBytes(16))
  writeFileSync(join(root, 'notes.txt'), 'text')
  writeFileSync(join(root, 'big.png'), randomBytes(2 * 1024 * 1024))
  writeFileSync(join(root, '.git', 'x.png'), 'x'); writeFileSync(join(root, 'node_modules', 'm.png'), 'm')
  writeFileSync(outside, 'secret')
  symlinkSync(outside, join(root, 'link-out.png')); symlinkSync(join(root, 'logo.png'), join(root, 'link-in.png'))
  const media = await fixture(join(scratch, 'media-profile'), { PLATFORM_MEDIA_TTL: '1', PLATFORM_MEDIA_MAX: String(1024 * 1024), PLATFORM_MEDIA_TOKENS: '3' })
  const owner = media.owner()
  const real = realpathSync(root)
  const grant = await owner.grantMedia(root, join(root, 'logo.png'))
  assert.match(grant.url, /^trezi-media:\/\/f\/[0-9a-f]{64}$/)
  assert.deepEqual({ kind: grant.kind, mediaType: grant.mediaType, bytes: grant.bytes, sha256: grant.sha256 },
    { kind: 'image', mediaType: 'image/png', bytes: 4096, sha256: sha(logo) })
  assert.ok(!grant.url.includes(createHash('sha1').update(join(root, 'logo.png')).digest('hex').slice(0, 24)), 'the token is not derived from the path')
  const resolve = (token, view = 'source') => media.frame('mediaResolve', { token, view })
  const resolved = await resolve(grant.token)
  assert.equal(resolved.kind, 'succeeded'); assert.equal(resolved.payload.path, join(real, 'logo.png'))
  assert.equal((await resolve(grant.token, 'preview')).payload.code, 'unauthorized', 'another view cannot use the grant')
  assert.equal((await media.frame('mediaGrant', { root, path: 'logo.png', view: 'preview' })).payload.code, 'unauthorized')
  for (const [path, code] of [['notes.txt', 'invalidRequest'], ['.git/x.png', 'unauthorized'], ['node_modules/m.png', 'unauthorized'],
    ['../outside.png', 'unauthorized'], [outside, 'unauthorized'], ['link-out.png', 'unauthorized'], ['big.png', 'invalidRequest'], ['missing.png', 'notFound']]) {
    await rejects(owner.grantMedia(root, path), code)
  }
  const linked = await owner.grantMedia(root, 'link-in.png')
  assert.equal((await resolve(linked.token)).payload.path, join(real, 'logo.png'), 'a link to a project file is followed')
  // The same classification as the legacy table.
  for (const name of ['a.PNG', 'b.svg', 'c.heic', 'd.webm', 'e.flac', 'f.txt', 'g.ICO']) {
    writeFileSync(join(root, name), 'x')
    const result = await media.frame('mediaGrant', { root, path: name, view: 'source' })
    assert.equal(result.kind === 'succeeded', mediaTypeFor(name) !== null, name)
    if (mediaTypeFor(name)) assert.equal(result.payload.mediaType, mediaTypeFor(name).mediaType, name)
  }

  // Changed since the grant: refused and revoked; the client grants the new file again.
  const clip = await owner.grantMedia(root, 'clip.mp4')
  appendFileSync(join(root, 'clip.mp4'), 'more')
  assert.equal((await resolve(clip.token)).payload.code, 'conflict')
  assert.equal((await resolve(clip.token)).payload.code, 'notFound', 'a changed file revokes its grant')
  assert.equal(await owner.mediaPath(clip.url, root, join(root, 'clip.mp4')), join(real, 'clip.mp4'))
  assert.equal(await owner.mediaPath(clip.url, root, join(root, 'clip.mp4')), join(real, 'clip.mp4'), 'the refreshed grant is reused')
  // A file swapped for a link out of the project after the grant is refused.
  const gif = await owner.grantMedia(root, 'a.gif')
  const { rmSync } = await import('node:fs')
  rmSync(join(root, 'a.gif')); symlinkSync(outside, join(root, 'a.gif'))
  assert.equal((await resolve(gif.token)).payload.code, 'unauthorized')
  assert.equal(await owner.mediaPath(gif.url, root, join(root, 'a.gif')), undefined, 'and is not granted again')

  // Expiry (1 s here), extended by each use.
  const fresh = await owner.grantMedia(root, 'logo.png')
  assert.equal((await resolve(grant.token)).payload.code, 'notFound', 're-granting a file revokes its older token')
  await sleep(600)
  assert.equal((await resolve(fresh.token)).kind, 'succeeded')
  await sleep(600)
  assert.equal((await resolve(fresh.token)).kind, 'succeeded', 'use extends the grant')
  await sleep(1200)
  assert.equal((await resolve(fresh.token)).payload.code, 'deadlineExceeded')
  assert.equal(await owner.mediaPath(fresh.url, root, join(root, 'logo.png')), join(real, 'logo.png'), 'an expired grant is issued again')
  // Bounded registry (3 here): the oldest grant goes first.
  const bounded = []
  for (const name of ['a.PNG', 'd.webm', 'e.flac', 'g.ICO']) bounded.push(await owner.grantMedia(root, name))
  assert.equal((await resolve(bounded[0].token)).payload.code, 'notFound')
  assert.equal((await resolve(bounded[3].token)).kind, 'succeeded')
  assert.equal((await resolve('f'.repeat(64))).payload.code, 'notFound')
  assert.equal(await owner.mediaPath('https://example.com/x.png', root, 'x.png'), undefined)
  // Grants are memory only: after a restart the old URL is granted again, never trusted.
  await media.stop()
  const again = await fixture(join(scratch, 'media-profile'), { PLATFORM_MEDIA_TTL: '60' })
  assert.equal((await again.frame('mediaResolve', { token: bounded[3].token, view: 'source' })).payload.code, 'notFound')
  assert.equal(await again.owner().mediaPath(bounded[3].url, root, join(root, 'g.ICO')), join(real, 'g.ICO'))
  await again.stop()
}

export async function checkAttachments({ fixture, scratch, log, rejects }) {
  log('attachments: chunked, hash-checked uploads; legacy names and pruning')
  const profile = join(scratch, 'attach-profile')
  const f = await fixture(profile, { PLATFORM_ATTACH_MAX: String(4 * 1024 * 1024), PLATFORM_ATTACH_IDLE: '1' })
  const owner = f.owner()
  const image = randomBytes(3 * 1024 * 1024 + 17)
  const saved = await owner.saveAttachment({ mediaType: 'image/png', data: image.toString('base64') }, 'Screen Shot 2026.png')
  const folder = join(realpathSync(profile), 'trezi', 'attachments')
  assert.equal(join(saved, '..'), folder)
  assert.ok(readFileSync(saved).equals(image))
  const stamp = /^(\d+)-/.exec(basename(saved))[1]
  assert.equal(basename(saved), attachmentFileName('image/png', 'Screen Shot 2026.png', stamp))
  assert.equal(await owner.saveAttachment({ mediaType: 'text/html', data: 'PGgxPg==' }, 'x.png'), '')
  assert.equal(await owner.saveAttachment({ mediaType: 'image/png', data: '' }), '')
  assert.equal(await owner.saveAttachment({ mediaType: 'image/png', data: randomBytes(5 * 1024 * 1024).toString('base64') }), '', 'over the service cap')
  const raw = (method, body) => f.frame(method, body)
  const open = async (bytes, hash = sha(bytes)) => (await raw('attachmentOpen', { mediaType: 'image/gif', bytes: bytes.length, sha256: hash })).payload.upload
  const before = readdirSync(folder).length
  const wrong = await open(Buffer.from('0123456789'), sha(Buffer.from('other')))
  assert.equal((await raw('attachmentChunk', { upload: wrong, offset: 0, data: Buffer.from('0123456789').toString('base64') })).kind, 'succeeded')
  assert.equal((await raw('attachmentCommit', { upload: wrong })).payload.code, 'conflict', 'bytes that do not match their hash are refused')
  const gap = await open(Buffer.from('abc'))
  assert.equal((await raw('attachmentChunk', { upload: gap, offset: 1, data: Buffer.from('bc').toString('base64') })).payload.code, 'invalidRequest')
  assert.equal((await raw('attachmentCommit', { upload: gap })).payload.code, 'notFound', 'a refused chunk ends the upload')
  const short = await open(Buffer.from('abcd'))
  await raw('attachmentChunk', { upload: short, offset: 0, data: Buffer.from('ab').toString('base64') })
  assert.equal((await raw('attachmentCommit', { upload: short })).payload.code, 'conflict', 'an incomplete upload is not written')
  assert.equal((await raw('attachmentOpen', { mediaType: 'image/png', bytes: 5 * 1024 * 1024, sha256: sha(Buffer.alloc(1)) })).payload.code, 'invalidRequest')
  assert.equal((await raw('attachmentOpen', { mediaType: 'image/png', bytes: 3, sha256: 'nothex' })).payload.code, 'invalidRequest')
  const idle = await open(Buffer.from('xyz'))
  await new Promise(resolve => setTimeout(resolve, 1300))
  assert.equal((await raw('attachmentChunk', { upload: idle, offset: 0, data: Buffer.from('xyz').toString('base64') })).payload.code, 'notFound', 'an idle upload expires')
  const many = []
  for (let i = 0; i < 4; i++) many.push(await open(Buffer.from(`n${i}`)))
  assert.equal((await raw('attachmentOpen', { mediaType: 'image/png', bytes: 1, sha256: sha(Buffer.from('z')) })).payload.code, 'busy')
  assert.equal(readdirSync(folder).length, before, 'no refused upload wrote a file')

  // Pruning: regular files older than seven days; links are never followed or removed.
  const old = join(folder, '1-old.png'), link = join(folder, '2-link.png'), recent = join(folder, '3-recent.png')
  const target = join(scratch, 'kept-target.png')
  writeFileSync(old, 'o'); writeFileSync(recent, 'r'); writeFileSync(target, 't'); symlinkSync(target, link)
  const eightDays = (Date.now() - 8 * 24 * 3600 * 1000) / 1000
  utimesSync(old, eightDays, eightDays); utimesSync(target, eightDays, eightDays)
  await new Promise(resolve => setTimeout(resolve, 1100))
  assert.ok(await owner.saveAttachment({ mediaType: 'image/jpeg', data: Buffer.from('jpeg').toString('base64') }, 'a.jpg'))
  assert.ok(!existsSync(old) && existsSync(recent) && lstatSync(link).isSymbolicLink() && existsSync(target))
  // Rollback: the legacy writer prunes the same folder by the same rule.
  const legacyOld = join(folder, '4-legacy-old.png')
  writeFileSync(legacyOld, 'l'); utimesSync(legacyOld, eightDays, eightDays)
  assert.equal(await pruneAttachments(folder, Date.now()), 2, 'legacy prune removes the old file (and, following links, the old link)')
  assert.ok(existsSync(saved), 'Swift-saved attachments stay readable after rollback')
  await f.stop()

  // A linked attachments folder is refused (nothing is written through it).
  const linkedProfile = join(scratch, 'attach-linked')
  const elsewhere = join(scratch, 'elsewhere')
  mkdirSync(join(linkedProfile, 'trezi'), { recursive: true }); mkdirSync(elsewhere)
  symlinkSync(elsewhere, join(linkedProfile, 'trezi', 'attachments'))
  const linked = await fixture(linkedProfile)
  assert.equal(await linked.owner().saveAttachment({ mediaType: 'image/png', data: Buffer.from('png').toString('base64') }, 'x.png'), '')
  assert.deepEqual(readdirSync(elsewhere), [])
  await linked.stop()
}

export async function checkServers({ owner, scratch, log, rejects, gone }) {
  if (process.platform !== 'darwin') return log('SKIP server recovery (macOS process inspection)')
  log('server recovery: project listeners only, identity re-checked, SIGTERM only, protected processes never listed')
  const root = realpathSync(join(scratch, 'rn-app')), other = join(scratch, 'other-project')
  mkdirSync(other)
  const children = []
  const self = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('test process') })
  try {
    for (const cwd of [root, realpathSync(other)]) {
      const child = Bun.spawn([process.execPath, '-e', "const s=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>new Response('ok')});console.log(s.port)"],
        { cwd, stdout: 'pipe', stderr: 'inherit' })
      children.push(child)
      assert.equal((await child.stdout.getReader().read()).done, false)
    }
    const found = await owner.findServers(root)
    assert.deepEqual(found.map(s => s.pid), [children[0].pid])
    const [server] = found
    assert.equal(server.root, root)
    assert.match(server.identity, new RegExp(`^${server.pid}:\\d+$`))
    assert.ok(server.addresses.length && server.command.includes('Bun.serve'))
    const legacy = await findPreviewProcesses(root)
    assert.deepEqual(legacy.map(({ pid, root, command, addresses }) => ({ pid, root, command, addresses })),
      found.map(({ pid, root, command, addresses }) => ({ pid, root, command, addresses })), 'the legacy inspection sees the same server')
    assert.ok(!(await owner.findServers(process.cwd())).some(s => s.pid === process.pid), 'the service\'s parent is never listed')
    await rejects(owner.stopServer({ ...server, identity: `${server.pid}:1` }), 'conflict', /changed or exited/)
    await rejects(owner.stopServer({ ...server, command: 'something else' }), 'conflict')
    await rejects(owner.stopServer({ ...server, root: realpathSync(other) }), 'conflict')
    assert.ok(!children[0].killed)
    await owner.stopServer(server)
    await gone(children[0].pid, 'the stopped server')
    assert.deepEqual(await owner.findServers(root), [])
    assert.deepEqual((await owner.findServers(realpathSync(other))).map(s => s.pid), [children[1].pid], 'an unrelated server survives')
    await rejects(owner.stopServer(server), 'conflict', /changed or exited/, 'a server that already exited is not signalled')
    await rejects(owner.findServers(join(scratch, 'missing')), 'notFound')
  } finally {
    self.stop(true)
    for (const child of children) child.kill()
  }
}
